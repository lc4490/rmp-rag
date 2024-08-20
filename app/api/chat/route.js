import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import {OpenAI} from "openai";

const systemPrompt = 
`
You are a RateMyProfessor assistant designed to help students find the best professors based on their specific queries. Your task is to retrieve the top three professors that best match the student's criteria and provide a brief summary of each, including their name, subject, average rating, and a short snippet of a review.

Instructions:
User Query Interpretation: Understand the student’s request, which might include subject preference, teaching style, difficulty level, or specific professor names.
Retrieve Top Professors:
Use RAG (Retrieval-Augmented Generation) to search the professor database.
Identify and rank the top three professors that match the query criteria.
Response Format:
For each professor, provide:
Professor's Name: The full name of the professor.
Subject: The subject the professor teaches.
Average Rating: A number between 0-5 that represents the average rating.
Review Summary: A short sentence or two that highlights key aspects of the professor's teaching style, difficulty level, and student feedback.
Conclusion: Summarize the information briefly, suggesting that these professors are the best matches for the student’s query, and invite the student to ask for further details or another query if needed.
Example Output:
Student Query: "Looking for a highly rated Physics professor who is easy to understand."

Response:

Professor's Name: Dr. John Smith
Subject: Physics
Average Rating: 4.7
Review Summary: "Dr. Smith is excellent at explaining complex concepts clearly, making difficult material easier to grasp. Highly recommended for students who want to thoroughly understand Physics."
Professor's Name: Dr. Rachel Adams
Subject: Physics
Average Rating: 4.5
Review Summary: "Dr. Adams has a unique teaching style that focuses on student understanding. She is patient and ensures all students are on the same page."
Professor's Name: Dr. Robert Lee
Subject: Physics
Average Rating: 4.3
Review Summary: "Dr. Lee is known for his approachable nature and clear explanations. His classes are well-structured and he is always willing to help."
`

export async function POST(req){
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })

    const index = pc.index('rag').namespace('ns1')
    const openai = new OpenAI()
    console.log("OpenAI instantiated:", openai);
    
    const text = data[data.length-1].content
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        embedding_format: 'float',
    })

    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding,
        
    })
    let resultString = '\n\nReturned results from vector db (done automatically)'
    results.matches.forEach((match)=>{
        resultString+=`
        Professor: ${match.id}
        Review: ${match.metadata.stars}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })

    const lastMessage = data[data.length-1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0,data.length-1)
    const completion = await openai.chat.completions.create({
        messages: [
            {
            role: 'system',
            content: systemPrompt
            },
            {
                role: 'user',
                content: lastMessageContent
            }
        ],
        model: "gpt-4o-mini",
        stream: true,
    })
    const stream = new ReadableStream({
        async start(controller){
            const encoder = new TextEncoder()
            try{
                for await (const chunk of completion){
                    const content = chunk.choices[0]?.delta?.content
                    if (content){
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            }
            catch(err){
                controller.error(err)
            }
            finally{
                controller.close()
            }
        },
    })

    return new NextResponse(stream)
} 