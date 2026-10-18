import base from "./fr.json";
import homeSections from "./fr/home-sections.json";
import gallery from "./fr/gallery.json";
import modelPage from "./fr/model-page.json";

/**
 * Textes français. Les écrans du catalogue ont leur propre fichier (messages/fr/*.json),
 * fusionné ici au premier niveau : chaque fichier ne contient que ses espaces de noms.
 */
export const messages = { ...base, ...gallery, ...modelPage, ...homeSections };

export default messages;
