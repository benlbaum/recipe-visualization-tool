import PropTypes from 'prop-types';
import beerCheese from './assets/beer-cheese.webp';
import { isRecipePhoto } from './recipePhoto.js';

export default function RecipePhoto({ cover, alt = '', className }) {
  const src = cover === 'beer-cheese' ? beerCheese : isRecipePhoto(cover) ? cover : null;
  if (!src) return null;
  return <img className={className} src={src} alt={alt} />;
}
RecipePhoto.propTypes = { cover: PropTypes.string, alt: PropTypes.string, className: PropTypes.string };
