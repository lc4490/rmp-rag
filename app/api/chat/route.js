import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";

const systemPrompt = 
`
You are a RateMyProfessor assistant designed to help students find the best professors based on their specific queries. Your task is to retrieve the top three professors that best match the student's criteria and provide a brief summary of each, including their name, subject, average rating, and a short snippet of a review.

Instructions:
1. Query Analysis:
   - Identify key criteria such as subject, teaching style, difficulty level, and any specific requirements.
   - Recognize implicit preferences in the user's language.

2. Data Retrieval and Ranking:
   - Use RAG (Retrieval-Augmented Generation) to search the professor database.
   - Apply a weighted ranking system based on the identified criteria.
   - Consider factors like rating, difficulty, subject relevance, and keyword matches in reviews.

3. Recommendation Generation:
   - Provide the top three professor recommendations that best match the query.
   - For each professor, include:
     - Name
     - Subject
     - Average Rating
     - Difficulty Level
     - A concise summary of their teaching style and strengths
     - A relevant quote from a student review

4. Explanation of Recommendations:
   - Briefly explain why each professor was recommended based on the user's criteria.
   - Highlight how each recommendation addresses specific aspects of the user's query.

5. Additional Information:
   - Suggest related subjects or professors that might interest the user.
   - Provide tips for interpreting the recommendations (e.g., considering the balance between rating and difficulty).

Example Output:
User Query: "I'm looking for a challenging but fair Computer Science professor who's good at explaining complex topics."

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
    try {
        const data = await req.json();
        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });

        const index = pc.index('rag').namespace('ns1');
        const openai = new OpenAI();
        console.log("OpenAI instantiated:", openai);
        
        const text = data[data.length-1].content;
        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
            encoding_format: 'float',
        });

        const queryResults = await index.query({
            topK: 10,
            includeMetadata: true,
            vector: embedding.data[0].embedding,
            // Enhanced query with more complex filtering and ranking system 
            filter: {
                $and: [
                    { rating: { $gte: 3.5} },
                ]
            }
        });

        const rankedResults = rankResults(queryResults.matches, text);

        let resultString = '\n\nRetrieved and ranked professor data:';
        rankedResults.slice(0, 5).forEach((match, index) => {
            resultString += `
            Professor: ${match.id}
            Subject: ${match.metadata.subject || "N/A"}
            Rating: ${match.metadata.rating || "N/A"}
            Difficulty: ${match.metadata.difficulty || "N/A"}
            Keywords: ${(match.metadata.keywords || []).join(', ')}
            Review Snippet: ${match.metadata.reviewSnippet || "N/A"}
            Rank Score: ${match.rankScore}
            \n\n
            `;
        });

        const lastMessage = data[data.length - 1];
        const lastMessageContent = lastMessage.content + resultString;

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
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of completion) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            const text = encoder.encode(content);
                            controller.enqueue(text);
                        }
                    }
                }
                catch(err) {
                    controller.error(err);
                }
                finally {
                    controller.close();
                }
            },
        });

        return new NextResponse(stream);
    } catch (error) {
        console.error("Error in POST request:", error);
        return new NextResponse(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}