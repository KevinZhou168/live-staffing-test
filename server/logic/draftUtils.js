/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * This ensures that the array is randomly reordered.
 * 
 * @param {Array} array - The array to be shuffled.
 * @returns {Array} - The shuffled array.
 */
function shuffleArray(array) {
  // Iterate over the array from the last element to the first
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index between 0 and the current index (inclusive)
    const j = Math.floor(Math.random() * (i + 1));

    // Swap the elements at the current index and the random index
    [array[i], array[j]] = [array[j], array[i]];
  }
  // Return the shuffled array
  return array;
}

// Export the shuffleArray function for use in other modules
module.exports = { shuffleArray };