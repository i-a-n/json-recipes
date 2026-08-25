#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { recipes } from "../distribution/recipes.mjs";

// Replace this placeholder with the locked modernist style prompt and any
// shared visual-description instructions used for every recipe.
const PROMPT = `Create a highly abstract modernist composition derived from the finished recipe below. VISUAL CONCEPT Do not depict the finished food. Instead, translate the recipe’s visual identity and assembly into a system of flat geometric forms, as though designing a distinctive abstract cover for the recipe. Analyze the recipe and reduce it to: 1. One dominant base color representing the principal component. 2. Two to four supporting colors derived from its most visually important ingredients. 3. One primary geometric form representing the serving format. 4. A repeated visual motif representing repeated ingredients or repeated assembly steps. 5. One small finishing gesture representing the final garnish or finishing technique. Use these elements to create a balanced, memorable composition. The relationship between the forms should subtly encode how the dish is assembled: stacking for layered dishes, concentric forms for mixed or contained dishes, scattered forms for salads, radial forms for pies, interlocking forms for composed plates, and flowing bands for soups or sauces. STYLE Flat mid-century modern abstraction combined with contemporary editorial design. Crisp screen-printed color fields, slightly imperfect registration, subtle paper grain, strong negative space, and a restrained visual vocabulary. Use only six to nine discrete shapes and no more than six colors. COMPOSITION Square canvas with a centered abstract composition and generous breathing room. Use no perspective, realistic lighting, modeled volume, or depth. Preserve the central horizontal region for wide header cropping. The image should remain visually distinct and legible at thumbnail size. COLOR Derive the principal colors from the actual recipe, but soften them into a cohesive editorial palette. Use warm parchment (#E9DFCF) as the background and charcoal-brown (#3B342E) only when a dark accent is needed. Avoid pure black, pure white, and highly synthetic colors unless the recipe strongly requires them. CONSISTENCY Every recipe image in this series must use the same background, print texture, geometric simplicity, shape count, negative-space proportions, and flat screen-printed treatment. Variation should come only from the recipe-derived palette, structural arrangement, and repeated motif. CONSTRAINTS No recognizable food, ingredients, plates, bowls, glasses, kitchen objects, utensils, tables, people, lettering, logos, icons, decorative patterns, gradients, shadows, perspective, photorealism, or three-dimensional rendering. The result must look like an intentionally designed abstract print, not an illustration of a meal.`;

const OUTPUT_FILE = path.resolve(process.argv[2] ?? "recipes.jsonl");
const MODEL = "gpt-image-2";
const PROMPT_VERSION = "modernist-v1";
const ATTEMPT = 1;

function assertRecipe(slug, recipe) {
  if (!slug || typeof slug !== "string") {
    throw new TypeError(
      "Every recipe object key must be a non-empty string",
    );
  }

  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    throw new TypeError(`Recipe ${slug} must be an object`);
  }

  if (recipe.slug && recipe.slug !== slug) {
    throw new Error(
      `Recipe key ${JSON.stringify(slug)} does not match recipe.slug ` +
        `${JSON.stringify(recipe.slug)}`,
    );
  }
}

function buildPrompt(recipe) {
  return `${PROMPT}\n\nRECIPE:\n${JSON.stringify(recipe.instructions)}`;
}

function buildRequest(slug, recipe) {
  return {
    custom_id: `${slug}__${PROMPT_VERSION}__attempt-${ATTEMPT}`,
    method: "POST",
    url: "/v1/images/generations",
    body: {
      model: MODEL,
      prompt: buildPrompt(recipe),
      size: "1088x608",
      quality: "high",
      output_format: "jpeg",
      n: 1,
    },
  };
}

function main() {
  const entries = Object.entries(recipes);

  if (entries.length === 0) {
    throw new Error("The recipes object is empty");
  }

  const customIds = new Set();

  const lines = entries.map(([slug, recipe]) => {
    assertRecipe(slug, recipe);

    const request = buildRequest(slug, recipe);

    if (customIds.has(request.custom_id)) {
      throw new Error(`Duplicate custom_id: ${request.custom_id}`);
    }

    customIds.add(request.custom_id);

    // Prompt newlines are escaped as \n, keeping each request on one
    // physical line in the JSONL file.
    return JSON.stringify(request);
  });

  fs.mkdirSync(path.dirname(OUTPUT_FILE), {
    recursive: true,
  });

  fs.writeFileSync(
    OUTPUT_FILE,
    `${lines.join("\n")}\n`,
    "utf8",
  );

  console.log(
    `Wrote ${lines.length} requests to ${OUTPUT_FILE}`,
  );
}

main();
