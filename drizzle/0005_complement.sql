-- Bloc COMPLÉMENT : des lignes prescrites mais jamais obligatoires.
--
-- Le troisième programme découpe chaque séance en deux : un NOYAU d'environ
-- 60 minutes, à faire tous les jours d'entraînement, et un COMPLÉMENT de 10 à
-- 20 minutes « les bons jours ». Le document est explicite — sauter le
-- complément n'est pas un échec, c'est prévu dans le design.
--
-- D'où un drapeau sur la ligne d'exercice, et non une seconde séance prescrite.
-- Deux séances par jour auraient fait compter un complément sauté comme une
-- séance manquée, et l'assiduité aurait affiché un décrochage qui n'existe pas.
--
-- Additive : la colonne prend « false » sur tout l'existant, donc les deux
-- programmes déjà importés gardent exactement le comportement qu'ils ont — tout
-- ce qu'ils prescrivent reste obligatoire.

ALTER TABLE "program_exercises" ADD COLUMN "optional" boolean DEFAULT false NOT NULL;
