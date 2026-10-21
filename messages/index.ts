import base from "./fr.json";
import account from "./fr/account.json";
import comments from "./fr/comments.json";
import content from "./fr/content.json";
import local from "./fr/local.json";
import downloads from "./fr/downloads.json";
import homeSections from "./fr/home-sections.json";
import gallery from "./fr/gallery.json";
import modelPage from "./fr/model-page.json";
import moderation from "./fr/moderation.json";

/**
 * Textes français. Les écrans du catalogue ont leur propre fichier (messages/fr/*.json),
 * fusionné ici au premier niveau : chaque fichier ne contient que ses espaces de noms.
 */
export const messages = {
  ...base,
  ...gallery,
  ...modelPage,
  ...homeSections,
  ...downloads,
  ...moderation,
  ...account,
  ...content,
  ...comments,
  ...local,
};

export default messages;
