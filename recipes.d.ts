// Contents of recipes.d.ts
declare module "json-recipes" {
  export interface Ingredient {
    name: string;
    quantity: string;
    notes?: string;
  }

  export interface IngredientGroup {
    groupName?: string;
    items: Ingredient[];
  }

  export interface Creator {
    user_id: string;
    username: string;
    email: string;
  }

  export interface Recipe {
    description?: string;
    schema_version: string;
    recipe_id: string;
    title: string;
    creator: Creator;
    ingredients: IngredientGroup[];
    instructions: string[];
    labels?: string[];
    yield: string;
  }

  export const recipes: { [key: string]: Recipe };
}
