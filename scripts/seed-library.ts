#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import {
  prepareIngestion,
  commitIngestion,
  type IngestInput,
} from '../lib/ingestion';
import { closeDb } from '../db';

const seedTexts: Array<IngestInput> = [
  {
    title: 'Mara și Mirela',
    author: 'Ion Creangă',
    sourceUrl: 'https://ro.wikisource.org/',
    sourceType: 'wikisource_ro',
    license: 'public_domain',
    rawContent: `Mara și Mirela erau două surori foarte iubite de părinți. Ele locuiau într-un sat mic din Transilvania. Zilele lor se petreceau în lucru și în joacă cuminți. Mara era mai mare și mai înțeleaptă, iar Mirela era mai mică și mai voioasă. Una dată, tatăl lor le-a povestit o basmă despre Prâslea și feciorul împăratului. Fetele ascultară cu atenție și-și doreau să fie tot așa de curajoase. Într-o vară, pe vremea secerișului, ele s-au aventurat în pădurea din lângă sat ca să culeagă bobite. Acolo, sub umbra unui stejar vechi, au găsit o lăzuie mică, și iată, era plină de bani de aur. La început se-nfricoșară, dar apoi au hotărât să-l ducă la părinții lor. Tatăl le-a zis că aceea era o cadou de la blestem, și că trebuie să o păstreze în secret. Fetele au promis și au ascuns mica lăzuie sub podeaua casei. Și de atunci, bogăția le-a ușurat viața, dar ele nu s-au-mborât și au rămas credincioase și bune cu toții.`,
    cefrLevel: 'A2',
    topicTags: ['folklore', 'family'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Noaptea de Noel',
    author: 'Mihail Sadoveanu',
    sourceUrl: 'https://ro.wikisource.org/',
    sourceType: 'wikisource_ro',
    license: 'public_domain',
    rawContent: `În noaptea de Crăciun, când zăpada cade lin și alb peste pământ, și fiecare suflet se-ntinde în zăpezi albe de speranță, pe drumul ce duce la mănăstire, un om singur merge. Vântul șoapte-i povești, și stelele gândesc și urmăresc fiecare pas. Moșul acesta avea o povară în inimă: o tăinuie pe care a ținut-o ascunsă ani de zile. Azi era ziua când trebuia s-o spună în fața sfântului și a preoților. Coloana de oameni se-ntorcea din cireșă, iar el rămânea singur. Luna veche dădea lumină slabă peste zăpezi. Ușa mănăstirii era deschisă, iar din interior ieșea țambal și cântec. Moșul simți cum ploaia umedă se-ntinde peste-ntreaga ființă a lui. Și-și duse mâna la piept, unde pulsau toate emoțiile dusurinane. Astăzi se-mpăca cu divinul.`,
    cefrLevel: 'B1',
    topicTags: ['literature', 'spirituality'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Animalele din pădure',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc_by',
    rawContent: `În pădure locuiesc multe animale. Ursul este mare și puternic. Lupul trăiește în haită. Vulpea este deșteaptă. Păsările zbor. Cervi mănâncă iarbă. Porci mistreți sunt sălbatici. Veverițele urcă pe copaci. Vrăbiile cântă frumos. Bufnițele veghează noaptea. Mistrețul este negru și pufos. Vânatul este periculos. Pădurea este frumoasă și vie cu creaturile sale.`,
    cefrLevel: 'A1',
    topicTags: ['nature', 'animals'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Cum se face pâine',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc_by',
    rawContent: `Pâinea este mâncarea din care nu lipsește din masă. Pentru a face pâine, trebuie să ai aluat. Aluat se face cu făină și apă. Se amestecă bine. Apoi se adaugă sare și drojdie. Se lasă să crească timp de două ore. După ce a crescut, se formează franghii și se pun pe tavă. Se lasă mai mult timp. Apoi se pun în cuptor, unde se coc la temperatură înaltă. După jumătate de oră, pâinea este gata. Se scoate din cuptor și se lasă să se răcească.`,
    cefrLevel: 'A2',
    topicTags: ['instructional', 'food'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Viața în sat',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc0',
    rawContent: `Sătenii muncesc din zori. Dimineața, ei merg la cărări și strâng apa din fântână. Apoi prepară mâncare. Bărbații pleacă la câmp să lucreze pământul. Seara se-ntâlnesc sub deal. În weekend se-ntâlnesc la obștea și discută de treburile satului. Fetele ajută pe mamă la gătit și spălat haine. Băieții se ocupă de animale și ciobănesc turme. Duminica toți merg la biserică. După slujbă mănâncă mâncăruri tradiționale. Noaptea dorm devreme. Viața în sat este simplă dar frumoasă și grea.`,
    cefrLevel: 'A2',
    topicTags: ['culture', 'rural_life'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Plouă',
    author: null,
    sourceUrl: null,
    sourceType: 'byo_paste',
    license: 'cc0',
    rawContent: `Plouă azi. Ploaia este rece. Norii sunt negri. Vântul bate ușor. Copacii se-ndoaie. Iarba este verde. Florile se-nclină. Oamenii au umbrele. Copiii nu pot juca afară. Bătrânii stau în casă. Pisicile se-ascund. Cioarele strigă. Frunzele cad pe pământ. Ploaia se-ntinde pretutindeni.`,
    cefrLevel: 'A1',
    topicTags: ['weather', 'nature'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Iarna în munte',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc_by',
    rawContent: `Iarna în munte este rece și frumoasă. Zăpada acoperă tot peisajul cu o pânză albă. Pârtiile de schi atrag mulți turiști. Oamenii se aleg în echipe și coboară pe pante. Nopțile sunt lungi și liniștitoare. Stelele strălucesc mai intens. Fauna se-ascunde în peșteri și adăposturi. Păsările migrează în țări mai calde. Vânatul și ursii hibernează. Dacă cineva se aventurează pe cărări, trebuie să fie pregătit. Avalanșele sunt periculoase. Blănile de gheață pot fi mortale. Dar pentru cei curajoși, muntele iarna oferă o experiență de neuitat.`,
    cefrLevel: 'B1',
    topicTags: ['nature', 'mountains', 'winter'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Povestea unei flori',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc_by_nc',
    rawContent: `O floare albă crește singură pe o stâncă galbenă. În jur este pustiu. Roșu și portocaliu ale soarelui o-ntinde zilele. Iar vântul-o șoapte povești de țări îndepărtate. Floarea visează la ploaia care nu vine, la albinele care fug, la fluturi care nu-și pun picioarele pe ea. Dar rămâne acolo, în singurătate, transpirând sensibilitate și speranță. Până îi ajunge o albină, obosită de zbor. Floarea-i oferă nectarul, iar albina-i duce polenul mai departe. Și floarea înțelege că sensul vieții nu este în frumusețe, ci în dăruire. Se deschide cu inimă deschisă. Și alți fluturi vin, alte albine trec. Și singurătatea ei se transformă în completitudine.`,
    cefrLevel: 'B2',
    topicTags: ['allegory', 'literature'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Piața din oras',
    author: null,
    sourceUrl: null,
    sourceType: 'byo_paste',
    license: 'cc0',
    rawContent: `Piața din oras este plină de oameni. Vânzătorii strigă la colț. Femeile cumpără legume. Bărbații aleargă după mărfuri. Copiii se joacă printre oameni. Chioșcurile vând diverse lucruri. Aici se vând pâine, brânzeturi, carne și pește. Se vând și haine, pantofi și alte obiecte. Mizarele sunt pline. Miresme și zăpuzi se-ntinde peste piață. Prețurile sunt negociate. Oamenii se-ntreabă și vorbesc. Piața este centrul vieții urbane. Seara se golește și-și așteaptă ușile pentru mâine.`,
    cefrLevel: 'A2',
    topicTags: ['daily_life', 'urban'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Copilărie',
    author: null,
    sourceUrl: null,
    sourceType: 'cc_blog',
    license: 'cc_by',
    rawContent: `Copilăria mea a fost plină de joacă și-ndrăzneli. Locuiam pe un deal, și-ntregul sat era terenul meu de aventură. Dimineața mă trezeam cu țipetul păsărilor. Mă-mbrăcam rapid și-alerga cu prietenii prin grădini și câmpuri. Uneori ne-ascundeam sub copacii mari, uneori eram căutatori. O dată am căzut și mi-am sucit piciorul. Dar am râs. Tata a venit și m-a ridicat. Și-mi spuse că oamenii curajoși nu plâng. Seara, mama ne-aducea pe verandă și-ne povestea povești. Bunicul cânta cântece despre eroii de demult. Și-ndrăzneli copilăriei mele au devenit temelia pentru omul care sunt astăzi.`,
    cefrLevel: 'B1',
    topicTags: ['memoir', 'family'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
];

async function main(): Promise<void> {
  console.log(`→ seeding library with ${seedTexts.length} texts...\n`);

  const results: Array<{ title: string; id?: string; error?: string }> = [];

  for (const input of seedTexts) {
    try {
      console.log(`→ analyzing "${input.title}" (${input.rawContent.length.toLocaleString()} chars)...`);
      const prepared = await prepareIngestion(input);

      console.log(`✓ analysis complete:`);
      console.log(`    sentences:           ${prepared.diagnostics.sentenceCount}`);
      console.log(`    word tokens:         ${prepared.diagnostics.wordCount}`);
      console.log(`    total tokens:        ${prepared.tokenRows.length}`);
      console.log(`    glosses resolved:    ${prepared.diagnostics.glossesResolved}`);

      const id = await commitIngestion(prepared);
      console.log(`✓ ingested as text ${id}\n`);

      results.push({ title: input.title, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ failed to ingest "${input.title}": ${message}\n`);
      results.push({ title: input.title, error: message });
    }
  }

  console.log('\n=== SEED LIBRARY RESULTS ===\n');
  results.forEach((r) => {
    if (r.error) {
      console.log(`✗ ${r.title}: ${r.error}`);
    } else {
      console.log(`✓ ${r.title}: ${r.id}`);
    }
  });

  const successes = results.filter((r) => !r.error).length;
  const failures = results.filter((r) => r.error).length;
  console.log(`\n${successes}/${seedTexts.length} texts ingested successfully`);
  if (failures > 0) {
    console.log(`${failures} failures — check output above`);
  }
}

main()
  .catch((err) => {
    console.error(`\n✗ seeding failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

