const fs = require("fs");
const path = require("path");

async function readRecipes() {
  // Define your recipe directories
  const recipeDirectories = [
    path.join(__dirname, "recipes/1.0"),
    path.join(__dirname, "recipes/1.1"),
    // Add as many directories as you need
  ];

  const recipes = {};

  // This function will contain the existing logic to process a single directory
  const processDirectory = async (directory) => {
    const recipeFiles = fs.readdirSync(directory);

    // Map each file in this directory to a promise and return the array of promises
    return recipeFiles.map(async (file) => {
      if (path.extname(file) === ".json") {
        try {
          // Construct the full path of the file
          const fullPath = path.join(directory, file);
          // Read the file's contents using Bun.sh
          const recipeContent = Bun.file(fullPath);
          // Parse the JSON content
          const recipeJSON = await recipeContent.json();
          // Add it to the recipes object. The key is the file name without the extension
          recipes[path.basename(file, ".json")] = recipeJSON;
        } catch (err) {
          console.error(`Failed to read or parse recipe file ${file}:`, err);
        }
      }
    });
  };

  let allPromises = [];

  // Use a for...of loop to handle the asynchronous operations
  for (const directory of recipeDirectories) {
    const directoryPromises = await processDirectory(directory);
    allPromises.push(...directoryPromises);
  }

  // Wait for all promises to be resolved
  await Promise.all(allPromises);

  // Once all files are read and the recipes object is constructed, write it to a .js file
  const outputFile = path.join(__dirname, "distribution", "recipes.js");
  const exportString = `export const recipes = ${JSON.stringify(
    recipes,
    null,
    2
  )};`;

  fs.mkdirSync(path.join(__dirname, "distribution"), { recursive: true }); // Ensure dist directory exists
  fs.writeFileSync(outputFile, exportString, "utf8");

  console.log(`Recipes have been compiled into ${outputFile}`);
}

// Use the function and handle the promise it returns

readRecipes()
  .then((recipes) => {
    console.log(`Recipes have been written to the distribution/ dir`);
  })
  .catch((error) => {
    console.error("Error writing recipes:", error);
  });
