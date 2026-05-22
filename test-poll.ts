import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function test() {
  const ai = new GoogleGenAI({});
  const uploadResponse = await ai.files.upload({
    file: "dummy.pdf",
    config: { mimeType: "application/pdf" }
  });
  console.log("State:", uploadResponse.state);
  
  if (uploadResponse.name) {
    let currentFile = await ai.files.get({ name: uploadResponse.name });
    console.log("Current state:", currentFile.state);
  }
}
test();
