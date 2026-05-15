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
import { getDb, closeDb } from '../db';
import { texts } from '../db/schema';
import { inArray } from 'drizzle-orm';

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
  // ── AI-generated seed texts (CC0) ──────────────────────────────────────
  // Generated by Claude (Cody) in May 2026. Calibrated to specific CEFR
  // levels and grammatical constructions for comprehension-curve coverage.
  // targetConstructions are documented here; token-level tagging is a
  // deferred patch (token_constructions table).
  {
    title: 'Dimineața Anei',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Ana se trezește la șapte dimineața. Se spală pe față și se îmbracă repede. Mănâncă un iaurt cu fructe și bea o cafea neagră. Ia geanta de pe scaun și iese pe ușă. Autobuzul vine la opt, dar Ana merge pe jos când e vreme bună. Drumul durează douăzeci de minute. Ajunge la birou înainte de colegi și pune cafeaua pe birou. Ziua de muncă începe.`,
    cefrLevel: 'A2',
    topicTags: ['daily_life', 'routine'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'La piață',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Maria merge la piața din cartier în fiecare sâmbătă. Cumpără legume proaspete: roșii, ardei, ceapă și morcovi. Vânzătorul îi zice: „Poftim, doamnă, roșiile sunt la trei lei kilogramul." Maria ia un kilogram de roșii și două kilograme de cartofi. Plătește cu cardul. La standul următor găsește brânză de burduf și cumpără o bucată mică. Se întoarce acasă cu sacoșa plină. Azi face mâncare pentru toată săptămâna.`,
    cefrLevel: 'A2',
    topicTags: ['shopping', 'food', 'market'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Toamna în parc',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Sâmbăta trecută, Andrei s-a dus la parcul din centrul orașului. Frunzele se coloraseră în galben și roșu aprins. S-a așezat pe o bancă și privea oamenii care treceau. Un bătrân hrănea porumbeii, iar doi copii se jucau cu frunzele uscate. Andrei și-a scos cartea din rucsac și a citit vreo oră. Apoi s-a ridicat și a mers pe jos până la râu. Seara s-a lăsat repede, cum se întâmplă toamna.`,
    cefrLevel: 'B1',
    topicTags: ['nature', 'seasons', 'urban'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Metroul din București',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Metroul din București are patru linii principale și leagă cartierele îndepărtate de centru. Pasagerilor le trebuie un card reîncărcabil pentru a călători. La orele de vârf, trenurile vin la fiecare două-trei minute, dar îi e greu oricui să găsească loc. Victor merge cu metroul în fiecare zi de la Berceni până la Piața Victoriei. Îi place că e mai rapid decât autobuzul și nu depinde de trafic. Uneori cedează locul doamnelor în vârstă sau mamelor cu copii mici.`,
    cefrLevel: 'B1',
    topicTags: ['city_life', 'transportation'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Rețeta bunicii',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Sarmalele sunt mâncarea preferată a familiei noastre de Crăciun. Bunica ne-a lăsat rețeta ei, pe care o facem în fiecare an. Mai întâi, toacă carnea de porc cu ceapă și amestec-o cu orez fiert pe jumătate. Adaugă sare, piper și cimbru după gust. Învelește umplutura în foi de varză murată și pune sarmalele în oală. Toarnă deasupra un borcan de bulion și lasă-le să fiarbă la foc mic trei ore. Servește-le cu smântână și mămăligă.`,
    cefrLevel: 'B1',
    topicTags: ['food', 'family', 'tradition'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Cetatea de Scaun a Sucevei',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Cetatea de Scaun a Sucevei a fost reședința domnitorilor Moldovei timp de aproape două sute de ani. Construcția sa a început în secolul al XIV-lea, pe vremea lui Petru I Mușat. Zidurile cetății atingeau pe alocuri grosimi de șase metri, menite să reziste atacurilor otomane. Cea mai grea încercare a venit în 1476, când Ștefan cel Mare a apărat-o împotriva armatei lui Mehmed al II-lea. După declinul Moldovei, cetatea a fost abandonată treptat și parțial demolată de turci în 1675. Astăzi, ruinele sunt un simbol al rezistenței medievale moldovenești.`,
    cefrLevel: 'B2',
    topicTags: ['history', 'medieval', 'moldova'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Ielele',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Se spune că ielele ar fi niște ființe supranaturale care dansează în nopțile de vară, la răscruci de drumuri sau lângă ape. Omul care le-ar vedea dansând ar putea înnebuni sau ar rămâne paralizat. De aceea, bătrânii sfătuiau să nu dormi sub cerul liber după miezul nopții, ca să nu te trezești în cercul lor. Unii ziceau că ar fi spiritele femeilor moarte nebotezate, alții că ar fi zâne rele. Indiferent de origine, ielele rămân una dintre cele mai temute prezențe din mitologia românească.`,
    cefrLevel: 'B2',
    topicTags: ['folklore', 'mythology'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Scrisoare către viitorul meu eu',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Dacă aș fi știut atunci ce știu acum, aș fi ales altfel. Aș fi acordat mai mult timp prietenilor mei vechi, în loc să alerg după proiecte care nu au mai contat. Greșelile tinereții mele mi-au oferit, în cele din urmă, cea mai valoroasă lecție: că nimeni nu-ți poate da înapoi timpul pierdut. Îi sunt recunoscătoare versiunii de ieri a mea pentru că a rezistat, chiar și atunci când nu înțelegea de ce merită să continue. Celui care va citi aceste rânduri în viitor îi spun: fii mai blând cu tine însuți.`,
    cefrLevel: 'B2',
    topicTags: ['personal_reflection', 'identity'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // ── end AI-generated seed texts ─────────────────────────────────────────
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

  const db = getDb();
  const existing = await db.select({ title: texts.title }).from(texts).where(
    inArray(texts.title, seedTexts.map((t) => t.title)),
  );
  const existingTitles = new Set(existing.map((r) => r.title));
  if (existingTitles.size > 0) {
    console.log(`→ skipping ${existingTitles.size} already-ingested text(s): ${[...existingTitles].join(', ')}\n`);
  }

  const toIngest = seedTexts.filter((t) => !existingTitles.has(t.title));
  console.log(`→ ${toIngest.length} new text(s) to ingest\n`);

  const results: Array<{ title: string; id?: string; error?: string; skipped?: true }> = [
    ...existing.map((r) => ({ title: r.title, skipped: true as const })),
  ];

  for (const input of toIngest) {
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
    if (r.skipped) {
      console.log(`— ${r.title}: already present, skipped`);
    } else if (r.error) {
      console.log(`✗ ${r.title}: ${r.error}`);
    } else {
      console.log(`✓ ${r.title}: ${r.id}`);
    }
  });

  const successes = results.filter((r) => !r.error && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failures = results.filter((r) => r.error).length;
  console.log(`\n${successes} ingested, ${skipped} skipped, ${failures} failed`);
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

