import { db } from "./db/index.js";
import { todosTable } from "./db/schema.js";
import { ilike, eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import readlineSync from "readline-sync";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function getAllTodos() {
  const todos = await db.select().from(todosTable);
  return todos;
}

async function createTodo(todoText) {
  try {
    console.log("Attempting to create todo:", todoText);
    
    const [result] = await db
      .insert(todosTable)
      .values({
        title: todoText,
        completed: false,
      })
      .returning({
        id: todosTable.id,
      });
    
    console.log("Todo created successfully with ID:", result.id);
    return result.id;
  } catch (error) {
    console.error("Database error details:", {
      message: error.message,
      cause: error.cause,
      query: error.query,
      params: error.params
    });
  }
}

async function searchTodo(search) {
  try {
    const todos = await db
      .select()
      .from(todosTable)
      .where(ilike(todosTable.title, `%${search}%`)); 
    return todos;
  } catch (error) {
    console.error("Error searching todos:", error);
    throw error;
  }
}

async function deleteTodoById(id) {
  // Fixed: Added await and return for proper execution
  const result = await db.delete(todosTable).where(eq(todosTable.id, id));
  return result;
}

const tools = {
  createTodo: createTodo,
  getAllTodos: getAllTodos,
  searchTodo: searchTodo,
  deleteTodoById: deleteTodoById,
};

const SYSTEM_PROMPT = `
You are an AI To-Do List assistant with START, PLAN, Action, Observation and Output State.
Wait for the user prompt and first PLAN using available tools.
After Planning, Take the action with appropriate tools and wait for Observation based on Action.
Once you get the observations, Return the AI response based on START prompt and observations

You can manage tasks by adding, viewing, updating and deleting them
You must strictly follow the JSON output format.

Todo DB Schema:
- id: int and Primary key
- title: string (the todo text)
- completed: boolean
- createdAt: Date Time
- updatedAt: Date Time

Available Tools:
- getAllTodos() : Returns all the todos from the database
- createTodo(title: string): creates a new todo in the db and takes title as a string and returns the id of that todo
- deleteTodoById(id: string): Deletes the todo by the Id given in database
- searchTodo(query: string): Searches for all todos matching the query string in the title field using ilike operator in drizzle-orm

EXAMPLE:
START
{"type":"user","user": "Add a task for shopping groceries."}
{"type":"plan","plan": "I will try to get more context on what user needs to shop."}
{"type":"output","output": "Can you tell me what items you want to shop for?"}
{"type":"user","user": "I want to shop for milk, nuts and oats"}
{"type":"plan","plan": "I will use createTodo to create a new todo in DB."}
{"type":"action","function": "createTodo","input": "Shopping for milk, oats and nuts."}
{"type":"observation","observation": "2"}
{"type":"output","output": "Your todo has been added successfully"}
`;

const messages = [{ role: "system", content: SYSTEM_PROMPT }];

async function main() {

  
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
      response_mime_type: "application/json"
    }
  });

  while (true) {
    try {
      const query = readlineSync.question(">> ");
      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log("Goodbye!");
        break;
      }

      const userMessage = {
        type: "user",
        user: query,
      };
      messages.push({ role: "user", content: JSON.stringify(userMessage) });

      // Convert messages to the format expected by Gemini
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === "system" ? "user" : msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({ history });

      while (true) {
        const lastMessage = messages[messages.length - 1];
        
        try {
          const result = await chat.sendMessage(lastMessage.content);
          const response = await result.response;
          const responseText = response.text();
          
          console.log("AI Response:", responseText);
          
          messages.push({ role: "assistant", content: responseText });

          const action = JSON.parse(responseText);
          
          if (action.type === "output") {
            console.log(`🤖: ${action.output}`);
            break;
          } else if (action.type === "plan") {
            console.log(`🧠 Planning: ${action.plan}`);
            // Continue to get the next action
            const planMessage = { role: "user", content: "Continue with your plan." };
            messages.push(planMessage);
          } else if (action.type === "action") {
            console.log(`🔧 Action: ${action.function}(${action.input})`);
            
            const fn = tools[action.function];
            if (!fn) {
              throw new Error(`Invalid tool call: ${action.function}`);
            }
            
            const observation = await fn(action.input);
            console.log(`👀 Observation:`, observation);
            
            const observationMsg = {
              type: "observation",
              observation: observation,
            };
            messages.push({
              role: "user", // Changed from 'developer' to 'user' as Gemini doesn't have 'developer' role
              content: JSON.stringify(observationMsg),
            });
          }
        } catch (parseError) {
          console.error("Error parsing AI response:", parseError);
          console.log("Raw response:", result ? await result.response.text() : "No response");
          break;
        }
      }
    } catch (error) {
      console.error("Error:", error.message);
      
    }
  }
}

main().catch(console.error);