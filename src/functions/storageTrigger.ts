import { InvocationContext, app, } from "@azure/functions";
const pdf = require('pdf-parse')
import { OpenAIEmbeddings } from "@langchain/openai"
import { QdrantVectorStore } from "@langchain/qdrant"

function render_page(pageData) {
    //check documents https://mozilla.github.io/pdf.js/
    let render_options = {
        //replaces all occurrences of whitespace with standard spaces (0x20). The default value is `false`.
        normalizeWhitespace: false,
        //do not attempt to combine same line TextItem's. The default value is `false`.
        disableCombineTextItems: false
    }
    return pageData.getTextContent(render_options)
        .then(function (textContent) {
            let lastY, text = '';
            for (let item of textContent.items) {
                if (lastY == item.transform[5] || !lastY) {
                    text += item.str;
                }
                else {
                    text += '\n' + item.str
                }
                lastY = item.transform[5];
            }
            return `${text}"/****ENDOFPAGE****/"`
        });
}


export const storageTrigger = async function (blob: unknown, context: InvocationContext) {
    console.log(context)
    context.log('Node.js Blob trigger function processed');
    if (context.triggerMetadata.blobextension === "pdf") {

        const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter')
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        })
        const data = await pdf(blob, {
            pagerender: render_page
        }
        )

        const pages = data.text.split("/****ENDOFPAGE****/")
        console.log("Pages detected", pages.length)
        const docs = []

        for (let i = 0; i < pages.length; i++) {
            const newdocs = await splitter.createDocuments(
                [pages[i]], [
                {
                    "phase": parseInt(process.env['DEV_PHASE']),
                    "timestamp": Math.round(new Date().getTime() / 1000),
                    "type": "external_document",
                    "uid": "thoughtbot_storageTrigger",
                    "userid": "shared",
                    "source_document": context.triggerMetadata.blobname,
                    "source_metadata": data.metadata
                }
            ],
                {
                    chunkHeader: `DOCUMENT NAME: ${context.triggerMetadata.blobname} \n\n-- -\n\n`,
                    appendChunkOverlapHeader: true,
                }
            )

            docs.push(...newdocs)
        }

        //now embed the documents
        const verbose = process.env['VERBOSE'] === "TRUE" ? true : false

        const vectorStore = await QdrantVectorStore.fromExistingCollection(
            new OpenAIEmbeddings({ verbose: verbose }),
            {
                url: process.env.QDRANT_URL,
                apiKey: process.env.QDRANT_TOKEN,
                collectionName: process.env.QDRANT_COLLECTION
            }
        )
        for (let i = 0; i < docs.length; i += 100) {
            const chunk = docs.slice(i, i + 100);
            vectorStore.addDocuments(chunk)
        }


        context.log("added", docs.length, " documents from pdf named", context.triggerMetadata.blobname + context.triggerMetadata.blobextension)
    }
};


app.storageBlob('storageTrigger', {
    connection: "IMPORT_STORAGE",
    path: "external-docs/{blobname}.{blobextension}",
    handler: storageTrigger
})