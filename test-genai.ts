import { GoogleGenAI } from "@google/genai";
import fs from "fs";

fs.writeFileSync("dummy.txt", "Hello World");

async function test() {
  const ai = new GoogleGenAI({});
  const uploadResponse = await ai.files.upload({
    file: "dummy.txt",
    config: { mimeType: "text/plain" }
  });
  
  console.log("Uploaded URI:", uploadResponse.uri);

  try {
    const result1 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        uploadResponse,
        "What does the file say?"
      ]
    });
    console.log("Success with format 1:", result1.text);
  } catch (e: any) {
    console.error("Format 1 error:");
    console.error(e.message);
  }

  try {
    const result2 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: uploadResponse.uri, mimeType: uploadResponse.mimeType } },
            { text: "What does the file say?" }
          ]
        }
      ]
    });
    console.log("Success with format 2:", result2.text);
  } catch (e: any) {
    console.error("Format 2 error:");
    console.error(e.message);
  }
}
test();
