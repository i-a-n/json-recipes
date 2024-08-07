// typescript recipe schema
// v1.4

interface Ingredient {
  name: string;
  quantity: string;
  notes?: string;
}

interface IngredientGroup {
  groupName?: string; // Now this can be blank
  items: Ingredient[]; // Ingredients within this group
}

interface Creator {
  user_id: string;
  username: string;
  email: string;
}

interface Recipe {
  description?: string;
  schema_version: string;
  recipe_id: string;
  slug: string;
  title: string;
  creator: Creator;
  ingredients: IngredientGroup[]; // Can handle only grouped ingredients
  instructions: string[];
  labels?: string[];
  yield: string;
}
