# MOOC Révision PWA

Application web installable sur iPhone, avec répétition espacée FSRS-6, stockage local, fonctionnement hors ligne et import de packs JSON.

## Mise en ligne

Le dossier doit être servi en HTTPS. Dépose simplement tout le contenu de ce dossier à la racine d'un sous-domaine ou d'un dossier de ton site (ex. `https://tonsite.fr/revisions/`).

## Installation iPhone

1. Ouvrir l'URL dans Safari.
2. Partager.
3. « Sur l'écran d'accueil ».
4. « Ajouter ».

## Format d'un pack de questions

```json
{
  "packID": "algebre-2",
  "title": "Algèbre linéaire - chapitre 2",
  "version": 1,
  "questions": [
    {
      "id": "alg2-001",
      "subject": "Algèbre linéaire",
      "chapter": "Valeurs propres",
      "prompt": "Question...",
      "answer": "Réponse...",
      "explanation": "Explication facultative",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

Les `id` sont stables : réimporter une question avec le même `id` met à jour son texte sans supprimer sa progression FSRS.
