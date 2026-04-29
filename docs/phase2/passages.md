# Phase 2 test passages

Three short Romanian passages (~50–80 words each) chosen to stress the four
pass criteria for UDPipe 2: genitive-dative on articulated NPs, compound
perfect with clitics, reflexive *se*, and definite article suffixes.

## 1. News (clean modern, full diacritics)

> Președintele a primit luni o delegație a guvernului. La întâlnire,
> ministrul i-a prezentat planul de reforme și i-a cerut sprijinul în
> Parlament. Datele oficiale arată că procesul va fi finalizat până în
> vara acestui an, dacă majoritatea își menține poziția.

**Targets:**
- *Președintele*, *ministrul*, *Datele*, *procesul*, *vara*, *majoritatea* — articulated nouns
- *a primit*, *i-a prezentat*, *i-a cerut* — compound perfect, second with dative clitic + perfect (the canonical gnarly case)
- *delegație a guvernului*, *vara acestui an* — genitive on articulated NP
- *va fi finalizat* — future passive
- *își menține* — reflexive dative

## 2. Literary (Eminescu — *Făt-Frumos din lacrimă*, opening; public domain)

> În vremea veche, pe când oamenii, cum sunt ei astăzi, nu erau decât în
> germenii viitorului, pe când Dumnezeu călca încă cu picioarele sale
> sfinte pietroasele pustii ale pământului, trăia un împărat întunecat și
> gânditor ca miazănoaptea cea senină.

**Targets:**
- *vremea veche*, *oamenii*, *germenii*, *picioarele*, *pietroasele pustii*, *pământului*, *miazănoaptea* — articulated nouns including fem pl, masc pl, gen
- *germenii viitorului*, *pietroasele pustii ale pământului* — complex genitive chains
- *picioarele sale sfinte* — possessive + plural agreement
- *călca*, *trăia* — imperfect (must not be confused with present)
- *cea senină* — demonstrative pronoun + articulated adj
- Embedded subordinate clauses (*pe când...*) test the parser, not just the tagger

## 3. Informal (manually diacriticked Reddit-style, contemporary)

> Salut băieți, am fost ieri la concertul lui Smiley și a fost mișto rău.
> M-am distrat super, mi-am întâlnit acolo o gașcă de prieteni vechi și
> ne-am pilit de toți banii. Cred că merg și la următorul, dacă mai prind
> bilete.

**Targets:**
- *am fost*, *a fost*, *m-am distrat*, *mi-am întâlnit*, *ne-am pilit* —
  perfect compound with reflexive accusative *m-*, reflexive dative *mi-*,
  reflexive plural *ne-* (canonical clitic-stack tests)
- *concertul lui Smiley* — possessive with proper-noun *lui* (genitive marker)
- *o gașcă de prieteni* — indef + partitive
- *următorul* — articulated ordinal
- *de toți banii* — definite + quantifier
- Slang lemmas (*pilit*, *mișto*) test OOV behaviour; lemma can fail
  gracefully here — what we care about is morphology + structure
