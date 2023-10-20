// typescript recipe schema
// v1.2

interface Ingredient {
  name: string;
  quantity: string;
  notes?: string;
}

interface IngredientGroup {
  groupName: string; // Name of the group, e.g., "for the frosting"
  items: Ingredient[]; // Ingredients within this group
}

interface Creator {
  user_id: string;
  username: string;
  email: string;
}

interface Recipe {
  schema_version: string;
  recipe_id: string;
  title: string;
  creator: Creator;
  ingredients: Ingredient[] | IngredientGroup[]; // Can handle both grouped and ungrouped ingredients
  instructions: string[];
  labels?: string[];
  yield: string;
}
