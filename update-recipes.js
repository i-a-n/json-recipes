const fs = require("fs");
const path = require("path");

// Directory containing your JSON files
const recipesDirectory = path.join(__dirname, "/recipes/1.0"); // Update with your actual folder

// Function to generate a slug from the file name
const createSlug = (fileName) => {
  return (nameWithoutExtension = path.basename(fileName, ".json"));
};

// Asynchronous function to read all files in the directory, update content and write back to the file
const updateRecipeFiles = async () => {
  try {
    // Read the directory
    const files = fs.readdirSync(recipesDirectory);

    // Iterate over the files
    for (const file of files) {
      // Process only .json files
      if (path.extname(file) === ".json") {
        const filePath = path.join(recipesDirectory, file);

        // Read the file's content
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const recipe = JSON.parse(fileContent);

        // Add the 'slug' field
        recipe.slug = createSlug(file);

        // Write updated content back to the file
        fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2), "utf-8");
        console.log(`Updated ${file}`);
      }
    }

    console.log("All files have been updated!");
  } catch (error) {
    console.error("Error updating files: ", error);
  }
};

// Run the function
updateRecipeFiles();
