// typescript recipe schema
// v1.0

interface Ingredient {
  name: string;
  quantity: string;
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
  ingredients: Ingredient[];
  instructions: string[];
  yield: string;
}
