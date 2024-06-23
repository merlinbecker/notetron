# Notetron - A Simple Low-Budget RAG Slack Chatbot for Managing Quick Notes

## Technologies Used

- Slack API
- Azure Function (TypeScript)
- Qdrant Cloud Vector Database
- OpenAI API (text-embedding-ada-002, gpt-3.5-turbo)
- LangFuse
- LangChain.js
- Cosmos DB

## Summary

Notetron is a low-budget Slack chatbot that operates with Retrieval Augmented Generation (RAG). The chatbot stores unstructured notes and retrieves them upon request. The setup includes Slack API, Azure Functions, Qdrant Cloud, and OpenAI API.

## Technical Setup

### Components

- **Slack API Component:** Set up as a Slack App via https://api.slack.com/apps.
- **Backend Component:** Azure Function App in the Consumption tier with an HTTP trigger for Slack requests. Security is managed with OAuth tokens and Function Key.
- **Vector Database:** Managed version of Qdrant in the cloud.
- **Embedding Endpoint:** OpenAI API model text-embedding-ada-002 (https://platform.openai.com/docs/guides/embeddings).
- **LLM Endpoint:** OpenAI API Completion Endpoint (https://platform.openai.com/docs/guides/text-generation/chat-completions-api).
- **Prompt Repository and Evaluation:** Optional component using LangFuse for prompt management and tracing.

### Slack API Component

Set up the Slack API component as a Slack App via https://api.slack.com/apps. Follow the steps described in [Introducing Slacktron](https://merlinbecker.de/introducing-slacktron-building-a-low-budget-always-on-slackbot-template-with-azure-functions-and-edbc7359bd4d). Use the [Slacktron template repository](https://github.com/merlinbecker/slacktron) as a basis.

### Backend Component

The orchestrator is an Azure Function App in the Consumption tier with an HTTP trigger for Slack requests. Use the Slacktron template for deployment. Secure the function with OAuth tokens and Function Key. Additionally, deploy a Cosmos DB to handle cold-start issues and log requests and responses.

### Endpoints for Embedding and the LLM

Utilize two endpoints from the OpenAI API:
- Embedding: [text-embedding-ada-002](https://platform.openai.com/docs/guides/embeddings)
- Completion: [chat-completions-api](https://platform.openai.com/docs/guides/text-generation/chat-completions-api)

### Prompt Repository and Evaluation

Integrate LangFuse as a prompt repository and tracing tool. More information can be found at [LangFuse](https://langfuse.com/).

### Qdrant Cloud Vector Database

Qdrant offers a generous free tier for private use. Ensure a steady stream of notes to prevent the cluster from switching to inactive mode.


### Usage of SaaS or PaaS Components

Most components are used as SaaS or PaaS, minimizing the amount of custom code required. Key components:
- [langchain.js](https://github.com/langchain-ai/langchainjs)
- [Slacktron template](https://github.com/merlinbecker/slacktron)

### Code for Qdrant Filtering

Special feature to filter Qdrant database queries by checking metadata for either the UserId or "shared":

[Gist for Qdrant](https://gist.github.com/merlinbecker/601edc014424572ae4a05ead3df24381)

### Integrating LangFuse

The integration of LangFuse into the existing Langchain code involves registering it as a callback handler for tracing and prompt management.

[Integrating LangFuse](https://gist.github.com/merlinbecker/40a8310c05c679da39650cc1edc1cc81)

## Managed Identity for Deployment

Ensure the correct configuration of federated credentials for the managed identity used for deployment to avoid deployment errors. Detailed steps can be found in the managed identity settings.

## Costs

The following table summarizes the annual costs incurred:

| Service             | Cost                  |
| ------------------- | --------------------- |
| azure cosmos db     | free-tier             |
| azure function      | free-tier             |
| azure log analytics | €0.05                 |
| azure storage       | €3.50                 |
| langflow            | free-tier - free      |
| openai embedding    | €7.16                 |
| openai gpt          | €1.79                 |
| qdrant              | free-tier - free      |
| slack               | free workspace        |

## Links

- [How it works (AWS)](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-it-works.html)
- [RAG from scratch (YouTube)](https://www.youtube.com/watch?v=wd7TZ4w1mSw&list=PLfaIDFEXuae2LXbO1_PKyVJiQ23ZztA0x)
- [Slack App API](https://api.slack.com/apps)
- [Introducing Slacktron](https://merlinbecker.de/introducing-slacktron-building-a-low-budget-always-on-slackbot-template-with-azure-functions-and-edbc7359bd4d)
- [Slacktron Template Repository](https://github.com/merlinbecker/slacktron)
- [OpenAI Embedding Endpoint](https://platform.openai.com/docs/guides/embeddings)
- [OpenAI Completion Endpoint](https://platform.openai.com/docs/guides/text-generation/chat-completions-api)
- [LangChain Documentation](https://js.langchain.com/v0.2/docs/introduction/)
- [LangChain GitHub Repository](https://github.com/langchain-ai/langchainjs)
- [LangFuse](https://langfuse.com/)
- [LangFuse GitHub Repository](https://github.com/langfuse/langfuse)
- [Gist for Qdrant](https://gist.github.com/merlinbecker/601edc014424572ae4a05ead3df24381)
- [Integrating LangFuse](https://gist.github.com/merlinbecker/40a8310c05c679da39650cc1edc1cc81)
