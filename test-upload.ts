import fs from "fs";

async function run() {
  const fileBuffer = fs.readFileSync("package.json");
  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  let body = "";
  body += "--" + boundary + "\r\n";
  body += 'Content-Disposition: form-data; name="file"; filename="package.json"\r\n';
  body += 'Content-Type: application/json\r\n\r\n';
  const postData = Buffer.concat([
    Buffer.from(body, "utf8"),
    fileBuffer,
    Buffer.from("\r\n--" + boundary + "--\r\n", "utf8")
  ]);

  const response = await fetch("http://localhost:3000/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=" + boundary
    },
    body: postData
  });
  
  const result = await response.json();
  console.log("Upload result:", result);

  if (result.success && result.taskId) {
      let status = "processing";
      while (status === "processing") {
          await new Promise(r => setTimeout(r, 2000));
          const res = await fetch(`http://localhost:3000/api/upload/status/${result.taskId}`);
          const statusResult = await res.json();
          console.log("Status update:", statusResult);
          status = statusResult.task?.status || "error";
      }
  }
}

run().catch(console.error);
