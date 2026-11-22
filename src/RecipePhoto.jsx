import PropTypes from 'prop-types';
import beerCheese from './assets/beer-cheese.webp';
import stirFry from './assets/veggie-stir-fry.jpg';
import { isRecipePhoto } from './recipePhoto.js';

const examplePhotos = new Map([['beer-cheese', beerCheese], ['stir-fry', stirFry]]);

export default function RecipePhoto({ cover, alt = '', className }) {
  const src = examplePhotos.get(cover) ?? (isRecipePhoto(cover) ? cover : null);
  if (!src) return null;
  return <img className={className} src={src} alt={alt} />;
}
RecipePhoto.propTypes = { cover: PropTypes.string, alt: PropTypes.string, className: PropTypes.string };
