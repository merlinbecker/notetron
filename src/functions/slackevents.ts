import { app, HttpRequest, HttpResponseInit, input, InvocationContext, output } from '@azure/functions'
import { App } from '@slack/bolt'
import { AzureFunctionsReceiver } from '../utils/AzReciever'
import { MessageEvent } from '../utils/types'
import { version } from '../../package.json';

import { CosmosDB } from "../utils/Cosmosdb"
import { setupAppInsights } from "../utils/AppInsights"
import { OpenAI } from '@langchain/openai';

import { OpenAIEmbeddings } from "@langchain/openai"
import { QdrantVectorStore } from "@langchain/qdrant"
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains"
import { Document } from "langchain/document"
import { PromptTemplate } from "@langchain/core/prompts"
import { CallbackHandler } from "langfuse-langchain";
import moment from 'moment'
import { Langfuse } from "langfuse"

import uuid4 from "uuid4"
const getVersion = async (): Promise<string> => {
    return new Promise((resolve, reject) => resolve(`My version is ${version}`))
}
const reverseText = async (m: MessageEvent): Promise<string> => {
    return new Promise((resolve) => resolve([...m.text].reverse().join("")))
}

const cosmosclient = new CosmosDB({
    key: process.env['COSMOS_KEY'],
    endpoint: process.env['COSMOS_ENDPOINT'],
    database: process.env["COSMOS_DB_NAME"],
    container: process.env["COSMOS_CONTAINER_NAME"]
})

const langfuseParams = {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_URL
}

const langfuseHandler = new CallbackHandler(langfuseParams)
const langfuse = new Langfuse(langfuseParams)

const ragchat = async (m: MessageEvent): Promise<string> => {
    //binde die History ein
    let user = ""
    if (m.channel_type === "im") {
        user = m.user
    }
    else {
        user = m.channel
    }
    let history = [""]
    /**todo, schauen ob ich hierfür auch langchain natives nehmen kann**/
    if (cosmosclient) {
        const { resources } = await cosmosclient.container.items.query(`SELECT TOP 2 * from c WHERE c.userid='${m.user}' ORDER BY c.timestamp DESC`).fetchAll();
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
    //hole die Dokumente aus der DB

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

    const chain = new RetrievalQAChain({
        combineDocumentsChain: loadQAStuffChain(llm, { prompt }),
        retriever: vectorStore.asRetriever(4, {
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
        }),
        verbose: process.env['VERBOSE'] === "TRUE" ? true : false
    });

    const result = await chain.invoke(
        {
            query: m.text,
            version: version,
            history: history.join("\n"),
            date: date,
            user: user
        },
        { callbacks: [langfuseHandler] }
    );

    //embedde den Text
    const uid = uuid4()
    const docs = [new Document(
        {
            pageContent: `${date} :${m.text}`,
            metadata: { uid: uid, phase: parseInt(process.env['DEV_PHASE']), type: "message", timestamp: parseInt(m.ts), userid: user }
        })]

    vectorStore.addDocuments(docs)
    //speichere zurück
    return new Promise((resolve) => resolve(result.text))
}

const checkConfiguration = () => {
    if (!(process.env["SLACK_SIGNING_SECRET"] && process.env["SLACK_BOT_TOKEN"])) {
        throw new Error("slack configuration incomplete")
    }
    if (!process.env["OPENAI_API_KEY"]) {
        throw new Error("OpenAI configuration incomplete")
    }
    if (!(process.env.QDRANT_URL && process.env.QDRANT_TOKEN && process.env.QDRANT_COLLECTION)) {
        throw new Error("qdrant configuration incomplete")
    }
    if (!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_URL)) {
        throw new Error("missing langfuse configuration")
    }
}



export async function slackevents(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    const servicename = process.env['SERVICENAME'] ?? "Notetron"
    setupAppInsights("SlackEvent", servicename)

    //check for complete configuration
    checkConfiguration()

    //connect to cosmosContainer
    await cosmosclient.init(servicename)

    const receiver = new AzureFunctionsReceiver(process.env["SLACK_SIGNING_SECRET"], console.log)
    const slackApp = new App({
        token: process.env["SLACK_BOT_TOKEN"],
        signingSecret: process.env["SLACK_SIGNING_SECRET"],
        receiver: receiver,
        processBeforeResponse: true
    })

    slackApp.command('/version', async ({ command, ack, say }) => {
        await ack()
        const answer = await cosmosclient.preCheckAndProcess({
            identifier: command.trigger_id,
            callback: getVersion,
            messagetext: command.text,
            userid: command.user_id
        },)
        if (answer) say(answer)
    })

    slackApp.message(async ({ message, say }) => {
        const m = message as MessageEvent
        if (message.subtype === undefined || message.subtype === 'bot_message') {
            let user = ""
            if (m.channel_type === "im") {
                user = m.user
            }
            else {
                user = m.channel
            }
            const answer = await cosmosclient.preCheckAndProcess({
                identifier: m.client_msg_id,
                callback: ragchat,
                callbackArgs: m,
                messagetext: m.text,
                userid: user
            },)
            if (answer) say(answer)
        }
    })

    const body = await receiver.requestHandler(request)
    return { status: 200, body: body }
}

app.http('slackevents', {
    methods: ['POST'],
    authLevel: 'function',
    route: "slack/events",
    handler: slackevents,
})