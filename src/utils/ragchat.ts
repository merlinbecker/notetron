import { CosmosDB } from './Cosmosdb'
import { MessageEvent } from './types'
import { OpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from "@langchain/openai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { Document } from "langchain/document"
import { PromptTemplate } from "@langchain/core/prompts"
import moment from 'moment'
import uuid4 from "uuid4"
import { CallbackHandler } from "langfuse-langchain";
import { Langfuse } from "langfuse"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"


const langfuseParams = {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_URL
}

const langfuseHandler = new CallbackHandler(langfuseParams)
const langfuse = new Langfuse(langfuseParams)

export class RagSystem {
    private cosmosclient
    constructor(config: {
        cosmosclient: CosmosDB
    }) {
        this.cosmosclient = config.cosmosclient
    }
    async ragchat(m: MessageEvent): Promise<string> {
        //enmbed the history
        let user = ""
        if (m.channel_type === "im") {
            user = m.user
        }
        else {
            user = m.channel
        }
        let history = [""]

        /**todo, schauen ob ich hierfür auch langchain natives nehmen kann**/
        if (this.cosmosclient) {
            const { resources } = await this.cosmosclient.container.items.query(`SELECT TOP 2 * from c WHERE c.userid='${m.user}' ORDER BY c.timestamp DESC`).fetchAll();
            history = resources.map(r => {
                return `
                [${user}]: ${r.query}
                [Du]: ${r.response}
                `
            })
        }
        const llm = new OpenAI({
            openAIApiKey: process.env["OPENAI_API_KEY"],
            temperature: 0,
            modelName: "gpt-3.5-turbo"
        })


        //retrieve documents from database
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
            new OpenAIEmbeddings({ verbose: process.env['VERBOSE'] === "TRUE" ? true : false }),
            {
                url: process.env.QDRANT_URL,
                apiKey: process.env.QDRANT_TOKEN,
                collectionName: process.env.QDRANT_COLLECTION
            }
        )

        moment.locale('de')

        const version = process.env['VERSION']
        const date = moment().format('LLLL')

        const promptTemplate = await langfuse.getPrompt("notetron")

        const prompt = PromptTemplate.fromTemplate(promptTemplate.getLangchainPrompt());

        const retriever = vectorStore.asRetriever(4, {
            "must": [
                {
                    "key": "metadata.userid",
                    "match": {
                        "any": [
                            m.user,
                            "shared"
                        ]
                    }
                }
            ]
        })

        const ragChain = await createStuffDocumentsChain({
            llm,
            prompt,
            outputParser: new StringOutputParser(),
        })

        const result = await ragChain.invoke(
            {
                context: await retriever.invoke(m.text),
                question: m.text,
                version: version,
                history: history.join("\n"),
                date: date,
                user: user
            },
            { callbacks: [langfuseHandler] }
        );

        //embed the text
        const uid = uuid4()
        const docs = [new Document(
            {
                pageContent: `${date} :${m.text}`,
                metadata: { uid: uid, phase: parseInt(process.env['DEV_PHASE']), type: "message", timestamp: parseInt(m.ts), userid: user }
            })]

        vectorStore.addDocuments(docs)
        return new Promise((resolve) => resolve(result))
    }

}
