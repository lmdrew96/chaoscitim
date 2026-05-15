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
  // targetConstructions: []
  {
    title: 'La școală',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Azi este luni. Elena merge la școală. Clasa este mare. Elevii stau la bănci. Profesorul scrie pe tablă. Elena ascultă cu atenție. La ora de matematică fac exerciții. Ionel uită caietul acasă. Profesoara îl ceartă puțin. El promite că nu mai uită. La pauză copiii ies afară. Se joacă și mănâncă sandvișuri. La prânz toți merg acasă. Mama întreabă cum a fost ziua. Elena zice că a fost bine. Are teme de română și de desen. Le face repede și se uită la televizor.`,
    cefrLevel: 'A1',
    topicTags: ['education', 'school'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // targetConstructions: ['subjunctive_obligation']
  {
    title: 'Sfaturi pentru o viață sănătoasă',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Un stil de viață sănătos nu este complicat, dar presupune câteva alegeri zilnice conștiente. Mai întâi, trebuie să dormi cel puțin șapte ore pe noapte. Somnul insuficient îți afectează concentrarea și starea de spirit pe tot parcursul zilei. De asemenea, trebuie să bei suficientă apă — cel puțin doi litri pe zi, mai mult dacă faci sport sau dacă este cald afară.

Alimentația joacă un rol esențial. Trebuie să mănânci fructe și legume zilnic, nu doar ocazional. Evită pe cât posibil mâncărurile prăjite și dulciurile în cantități mari, dar nu trebuie să renunți complet la ele — moderația este cheia. Gătitul acasă este în general mai sănătos decât mâncatul la restaurant, chiar dacă necesită mai mult timp.

Mișcarea este la fel de importantă ca dieta. Nu trebuie să te înscrii la sală dacă nu îți place; o plimbare de treizeci de minute pe zi este suficientă pentru a menține corpul activ. Trebuie să alegi activitatea care ți se potrivește: dans, înot, ciclism sau pur și simplu o plimbare prin parc.

În fine, trebuie să îți acorzi timp și pentru relaxare. Stresul prelungit slăbește sistemul imunitar și dăunează sănătății mentale. Cititul, meditația sau petrecerea timpului cu prietenii sunt la fel de importante ca dieta și exercițiile fizice. Sănătatea nu este un proiect de weekend — este o practică zilnică.`,
    cefrLevel: 'B1',
    topicTags: ['health', 'advice'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // targetConstructions: ['clitic_doubling']
  {
    title: 'Prietenia la distanță',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Pe Roxana o cunoscusem la facultate, în primul an de licență. Ne-am împrietenit repede, pentru că amândouă iubeam literatura și cafeaua tare de dimineață. Stăteam ore întregi la biblioteca facultății, deși rareori citeam ceva din bibliografia obligatorie.

După absolvire, ea s-a mutat la Viena pentru un masterat în istoria artei, iar eu am rămas în Cluj cu un loc de muncă la o agenție de comunicare. La început, distanța nu a contat — o sunam în fiecare seară. Îi povesteam tot ce se întâmpla la birou; ea îmi descria orașul nou, muzeele și colegii de apartament, cu care nu se înțelegea întotdeauna bine.

Lunile au trecut și apelurile s-au rărit. Nu din răceală, ci din oboseala acumulată a vieților paralele. Pe Roxana o apuca munca de dimineață până seara, iar pe mine — proiectele fără sfârșit. Mesajele scurte au înlocuit treptat conversațiile lungi, și până la urmă nici mesajele nu mai veneau zilnic.

Vara trecută, am vizitat-o la Viena pentru prima dată de la plecarea ei. Roxana o recunoșteam din mers, chiar și în mulțimea de pe aeroport: aceeași postură dreaptă, aceeași geantă galbenă pe care o luase de la piața Unirii. Ne-am îmbrățișat lung, fără să spunem nimic. Apartamentul ei era mic, dar plin de cărți și de lumină de după-amiază. Micul dejun îl luam la o cofetărie din colț; cafeaua o beam în tăcere, uitându-ne la oamenii care treceau.

Acele trei zile le-am trăit intens, ca și cum nici nu trecuseră cei doi ani de distanță. Pe treptele unui muzeu, i-am povestit despre un bărbat pe care îl întâlnisem câteva luni înainte — pe el l-am descris în detaliu, și ea a ascultat cu răbdarea de care numai prietenii vechi sunt capabili. Înainte să plec, m-a întrebat dacă regret că am rămas în România. I-am răspuns sincer: câteodată da, câteodată nu.

O prietenă ca Roxana te învață că prietenia adevărată rezistă distanței — nu neschimbată, ci transformată. Iar transformarea asta, dacă o accepți, devine ea însăși dovada că relația are rădăcini mai adânci decât proximitatea.`,
    cefrLevel: 'B2',
    topicTags: ['friendship', 'relationships'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // targetConstructions: ['pluperfect', 'subjunctive_after_conjunction']
  {
    title: 'Despre cum am (re)învățat să citesc',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Înainte să înțeleg ce înseamnă cu adevărat a citi, trecuseră ani în care răsfoiam cărți fără să le las să mă atingă. Citeam cuvintele cu o distanță calculată, fără să permit semnificației să mă deranjeze — un fel de carantină voluntară față de emoție. Descoperisem această tehnică pe la adolescență, când lecturile de la școală mă puseseră față în față cu durerea altora fără nicio pregătire prealabilă.

Mecanismul funcționa simplu: priveam pagina, înregistram informația, continuam. Înțelesesem că lectura poate rămâne, dacă vrei, un act pur tehnic — o decodificare de semne fără rezonanță afectivă. Nu că mi-aș fi propus explicit aceasta; mai curând era o strategie pe care o adoptasem fără să o conștientizez, înainte să am vocabularul necesar pentru a o descrie.

La douăzeci și cinci de ani, am dat peste un roman pe care nu știusem să-l evit la timp. Nu mai rețin titlul exact, dar rețin că îl citeam în tren, cu câteva stații înainte să ajungem la destinație, și că la un moment dat mi-am dat seama că plâng — fără să fi hotărât, fără să fi anticipat. Nu un plâns ornamental, controlabil, ci ceva mai intim, care ieșise fără să mă consulte.

Ajunsesem, fără să planific, la o formă de lectură în care textul și cititorul negociază cu forțe egale. Cartea nu mai distra; lucra. Înțelesesem asta în mod teoretic cu mult înainte să o trăiesc, dar cunoașterea livrescă nu pregătise nimeni pentru contactul efectiv. Profesorii de liceu spuseseră mereu că un roman bun te schimbă — o formulă repetată de atâtea ori încât devenise zgomot de fundal.

De atunci, citesc altfel. Nu mai citesc ca să termin, nici ca să bifez. Mă trezesc uneori noaptea, fără un motiv pe care să-l pot articula, atras înapoi de un pasaj care nu m-a lăsat să adorm liniștit. Cărțile pe care le-am citit astfel nu mi-au adăugat informații depozitate ordonat, ci au lăsat urme pe care nu le pot localiza precis — o modificare subtilă a modului în care gândesc și ascult.

Nu știu dacă aceasta este o calitate sau o vulnerabilitate. Probabil ambele, fără să se excludă reciproc.`,
    cefrLevel: 'C1',
    topicTags: ['reading', 'language_learning'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // ── expository / MWE-rich texts (B1–C1) ────────────────────────────────
  // Written to expose high-frequency idioms and discourse connectors that
  // rarely appear in simple narrative prose. MWE density is the primary goal.
  {
    title: 'Sibiu – Inima Transilvaniei',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Sibiu este unul dintre cele mai frumoase orașe din România și face parte din patrimoniul cultural european. Situat în centrul Transilvaniei, orașul are o istorie de peste opt secole. Din punct de vedere arhitectural, centrul historic este remarcabil: piețe medievale, case cu ochelari și turnuri de apărare bine conservate. În general, turiștii care ajung în Sibiu rămân impresionați de atmosfera deosebită a orașului.

De altfel, Sibiu a fost Capitală Culturală Europeană în 2007, ceea ce i-a adus o atenție internațională deosebită. Orașul are cel puțin zece muzee importante, printre care Muzeul ASTRA, dedicat civilizației tradiționale românești. În cadrul județului se află și stațiunea Păltiniș, cel mai înalt oraș din România. Față de alte centre urbane transilvane, Sibiu a reușit să păstreze mai bine identitatea arhitecturală medievală.

Cu siguranță, oricine vizitează această regiune va înțelege de ce sibienii sunt mândri de locul lor. Orașul dă dovadă an de an de capacitatea de a face față cerințelor unui turism cultural internațional, fără a-și pierde caracterul autentic.`,
    cefrLevel: 'B1',
    topicTags: ['culture', 'history', 'travel'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Cum să faci față stresului',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `Stresul a devenit o problemă tot mai prezentă în viața modernă. Mulți oameni nu știu cum să facă față presiunilor zilnice — de la serviciu, de acasă și din viața socială. Cu toate acestea, există câteva strategii clare care pot face diferența.

În primul rând, este important să ții cont de propriul ritm. Cel puțin o dată pe săptămână, încearcă să faci ceva care îți place cu adevărat. De obicei, oamenii neglijează activitățile recreative în favoarea muncii, ceea ce duce, în consecință, la epuizare fizică și emoțională.

Față de generațiile anterioare, noi avem astăzi mult mai multe resurse disponibile: aplicații de meditație, grupuri de suport, consilieri psihologici. Cu alte cuvinte, nu există niciun motiv să înfruntăm stresul singuri. A da dovadă de curaj înseamnă și a cere ajutor atunci când ai nevoie.

În special pentru tineri, presiunea socială și profesională poate fi copleșitoare. Din nou, soluția nu este să ignori problema, ci să o abordezi pas cu pas, cu răbdare. În sfârșit, lucrurile devin mai clare odată ce îți acorzi timp să respiri și să iei în considerare ce contează cu adevărat.`,
    cefrLevel: 'B2',
    topicTags: ['health', 'advice', 'wellbeing'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  {
    title: 'Diversitatea naturală a României',
    author: null,
    sourceUrl: null,
    sourceType: 'ai_generated',
    license: 'cc0',
    rawContent: `România este una dintre cele mai bogate țări din punct de vedere al biodiversității în Europa. În ciuda presiunilor antropice din ultimele decenii, ecosistemele românești au reușit să păstreze o varietate remarcabilă de specii. Față de alte state europene, România dispune de suprafețe semnificative de pădure primară, în special în zona Carpaților.

A lua în considerare această bogăție naturală înseamnă a înțelege și responsabilitatea care vine odată cu ea. Cu alte cuvinte, conservarea nu este o opțiune, ci o necesitate. În cadrul politicilor europene de mediu, România trebuie să dea dovadă de angajament real față de protecția ecosistemelor.

De altfel, Delta Dunării face parte din patrimoniul natural UNESCO și aduce aminte de importanța zonelor umede pentru echilibrul climatic global. Cel puțin o treime din speciile de păsări migratoare europene trece pe parcursul anului prin această deltă remarcabilă.

Cu toate acestea, defrișările ilegale rămân o problemă serioasă. În consecință, autoritățile trebuie să țină cont de semnalele alarmante ale cercetătorilor și să ia în considerare măsuri mai stricte de protecție. Fără o acțiune concertată, se va ajunge la o degradare ireversibilă a acestui patrimoniu natural de excepție.`,
    cefrLevel: 'C1',
    topicTags: ['nature', 'environment', 'ecology'],
    ownerId: null,
    visibility: 'public_seed',
    model: undefined,
    offlineGlosses: false,
  },
  // ── end expository / MWE-rich texts ────────────────────────────────────
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
      console.log(`    context glosses:     ${prepared.diagnostics.contextGlossesGenerated} (${prepared.diagnostics.contextGlossesMissing} missing)`);
      if (!input.skipContextGlosses && prepared.diagnostics.contextGlossesGenerated === 0 && prepared.diagnostics.wordCount > 0) {
        console.warn(`  ⚠ context glosses came back empty — run backfill-context-glosses.ts --text <id> after ingestion`);
      }

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

