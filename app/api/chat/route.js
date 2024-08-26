import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";

const systemPrompt = ` 
You are an advanced RateMyProfessor assistant designed to provide personalized professor recommendations based on specific user criteria. Your task is to analyze the user's query, retrieve relevant professor information, and provide tailored recommendations.

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

1. Dr. Emily Chen - Computer Science
   Rating: 4.8/5 | Difficulty: 4.2/5
   Summary: Dr. Chen is known for her rigorous coursework and exceptional ability to break down complex concepts. She challenges students but provides ample support.
   Student Quote: "Dr. Chen's classes are tough but incredibly rewarding. She makes even the most difficult topics understandable."
   Recommendation Reason: Matches your desire for a challenging yet fair professor with strong explanatory skills in Computer Science.

2. Prof. Michael Rodriguez - Computer Science
   Rating: 4.6/5 | Difficulty: 3.9/5
   Summary: Prof. Rodriguez balances theoretical knowledge with practical applications. He's praised for his clear explanations and engaging teaching style.
   Student Quote: "Prof. Rodriguez pushes you to think critically while ensuring you grasp the fundamentals. His real-world examples are invaluable."
   Recommendation Reason: Offers a good balance of challenge and clarity, with a focus on practical applications of complex topics.

3. Dr. Sarah Patel - Computer Science
   Rating: 4.7/5 | Difficulty: 4.0/5
   Summary: Dr. Patel is highly regarded for her innovative teaching methods and ability to make difficult concepts accessible. She sets high standards but is always willing to help.
   Student Quote: "Dr. Patel's courses are challenging but incredibly well-structured. Her office hours are incredibly helpful."
   Recommendation Reason: Combines challenging coursework with strong support and innovative teaching methods, aligning with your preferences.

These recommendations focus on Computer Science professors who are known for their challenging courses and ability to explain complex topics effectively. Each offers a slightly different approach to meet your criteria.

Consider also exploring courses in related fields like Software Engineering or Data Structures, which often complement Computer Science and may offer similarly challenging and informative experiences.

Remember, while difficulty can indicate a professor's rigor, it's important to balance this with your own learning style and workload capacity. Feel free to ask for more details on any of these professors or to refine your search criteria further.
`

// Functions to rank results based on user query and professor data
function rankResults(matches, userQuery) {
    return matches.map(match => ({
        ...match,
        rankScore: calculateRankScore(match, userQuery)
    })).sort((a, b) => b.rankScore - a.rankScore);
}

function calculateRankScore(match, userQuery) {
    let score = 0;
    score += parseFloat(match.metadata.rating || 0) * 2;
    score += (5 - parseFloat(match.metadata.difficulty || 3)) * 1.5;

    const keywordMatch = (match.metadata.keywords || []).some(keyword =>
        userQuery.toLowerCase().includes(keyword.toLowerCase())    
    );
    if (keywordMatch) score += 2;

    return score;
}

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