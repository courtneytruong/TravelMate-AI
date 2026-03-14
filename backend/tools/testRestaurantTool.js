import restaurantTool from "./restaurantTool.js";

async function main() {
  try {
    const result = await restaurantTool.func({
      city: "Lexington, KY",
      cuisine: "Chinese",
      limit: 3,
    });
    console.log(result);
  } catch (err) {
    console.error("Test failed:", err?.message ?? err);
  }
}

main();
