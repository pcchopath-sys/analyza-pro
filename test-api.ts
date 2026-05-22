import fetch from "node-fetch";

async function test() {
  const res = await fetch("http://localhost:3000/api/rab/default");
  console.log(await res.json());
}
test();
