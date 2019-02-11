/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GUI } from "dat.gui";
// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import {
    ContextualArabicConverter,
    FontCatalog,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutStyle,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";

/**
 * This example showcases how [[TextCanvas]] can handle loading of multiple heavy [[FontCatalog]]
 * assets, and present text on-demand when all required assets are ready.
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasStressTestExample {
    const stats = new Stats();
    const gui = new GUI({ hideable: false });
    const guiOptions = {
        fontName: "",
        gridEnabled: false,
        boundsEnabled: false,
        color: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        },
        backgroundColor: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        }
    };

    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let textCanvas: TextCanvas;
    let textLayoutStyle: TextLayoutStyle;
    let textRenderStyle: TextRenderStyle;
    let assetsLoaded: boolean = false;

    const textPosition: THREE.Vector3 = new THREE.Vector3(0, window.innerHeight / 2.0, 0.0);

    const textBounds: THREE.Box2 = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
    const characterBounds: THREE.Box2[] = [];
    let boundsScene: THREE.Scene;
    let boundsVertexBuffer: THREE.BufferAttribute;
    let boundsGeometry: THREE.BufferGeometry;
    let boundsObject: THREE.Object3D;

    let gridScene: THREE.Scene;

    // tslint:disable:max-line-length
    const characterCount = 32768;
    const textSample = ContextualArabicConverter.instance.convert(`LATIN
Lorem ipsum dolor sit amet, cum omnis solet consequuntur id, cum aliquid torquatos cu. Probo porro nominavi quo no, ut vix congue officiis. Homero principes posidonium eam at. Pro movet fuisset volumus at, sea ad vidit maluisset consequat. Ne cum scaevola recusabo. Ea simul prodesset sea.
Nonumy consul delicata mea an. Pro et mollis conclusionemque, falli fierent ad has, ei eos commodo molestiae. Alia wisi doming his ut, usu et tota altera. Sit eu errem tractatos definitionem, vix ut exerci nominati assueverit. Tota maiorum expetendis pro at, cu pro consul nusquam.
Vidit nostrud at nam. Volumus evertitur eos cu, te wisi cetero sea, eum ad suas atqui voluptatibus. Ipsum vidisse adipiscing at per, nec consul feugiat ea, dicant eleifend adolescens ut nam. Novum possit neglegentur ad est, te vim ignota expetenda. Id his facer repudiare, in eam suas nominati percipitur. Quis reprehendunt ad mea, nec erat inani in.
Iisque delicatissimi eum ex. Mutat ornatus veritus sea ad, delicata omittantur ex pri. Nibh option ne eum, aeque deleniti sententiae at vix, ne sale novum delicatissimi his. Et vix voluptua deserunt, ut velit dicit sea. An dolor regione recusabo nec. Mea simul definitiones ad, no persius volumus definiebas has, no munere perpetua dignissim mel.
At vide honestatis cum. Sit eu aeterno scriptorem, saepe docendi ut usu, mei et dicant elaboraret intellegam. Possit essent alterum ei sea, enim admodum ea nec. Homero tamquam at vix, in meliore appetere invidunt eos. Eu qui probo regione. Vulputate repudiandae nam et.
His regione fabulas no, ex his quodsi aliquam. Modus impedit ex vis, esse purto magna vis ut, justo evertitur vel eu. Mel consul maiestatis dissentiunt an. Ei duo aeque oblique petentium.
Qui te autem commodo sententiae. At eum purto detraxit definitionem, duo ei graecis postulant erroribus. Id purto principes vis, mel summo inermis posidonium et. Prima impetus invidunt sed at. Aperiam luptatum mnesarchum per an, eripuit electram disputando ad sea, per eu veniam vituperatoribus. Odio verterem te sit. Cum ne odio minim indoctum, modus dolore ad nam.
Ne debet vituperata usu, nec vero partem quodsi eu. Mea in sint augue accusam. Diam solum denique vis at, prima verear ornatus ei nam, quo facer verterem pericula ea. Fabellas recusabo consetetur quo ei, per ad vulputate rationibus complectitur. Te amet vitae sit, neglegentur instructior voluptatibus ut sed.
Debitis disputando duo te. Vel vide labitur petentium eu. Atqui facer discere usu id. Duo justo principes aliquando te. Duo ea blandit oporteat.
His in nibh idque, cu dicant civibus tincidunt vix. Vix vidit constituto ex. Cu mea fierent voluptatum, diam minimum nominati ea vis, te brute doming vim. Soluta explicari mea ei, ut tota melius reprehendunt sed. Quo ex essent nostro malorum, elitr iracundia percipitur mei no, quod nullam in mei.

CYRILLIC
Лорем ипсум долор сит амет, усу унум персеяуерис еа, при цлита цомплецтитур ет, пробатус волуптатум медиоцритатем яуи ех. Фацер лудус дефинитионес цу вел, еа убияуе дицерет волуптатум яуи. Алии интегре сеа ех, вих ид путент денияуе. Но инвидунт еффициенди цомплецтитур вис.
Усу еи веро иусто плацерат, детрахит волутпат яуи еа. Деленит цотидиеяуе ех сед. Ат пробо антиопам аццоммодаре нец. Хис граецис вивендум ад, вим еи яуас ессент адмодум. Еу пондерум легендос интеллегат меа.
Еу сед тале уллум, сеа ид нулла солет улламцорпер, ин либер диссентиунт нам. Сусципит апеириан сапиентем вел еа, пробо перципитур хис ан, поссим репрехендунт ех еам. Вим цу виси интеллегам. Сеа еи лаборес доценди, мазим популо алияуам ид ест, ат еос ностро репудиандае. Ад партем платонем еос, пер яуод вирис муциус цу, усу цу видиссе репудиаре.
Малорум петентиум ратионибус меа цу, мел постеа аццусамус ан. Ад фацер убияуе омиттам иус, еум еи делецтус ехпетендис. Диспутандо сигниферумяуе те яуо, ест ет стет либер елитр. Ат нонумы легере вел, ин вис алиа граецо цонсулату. Еа перицулис витуператорибус нам.
Вис цу аетерно диссентиунт, вел алтерум мандамус цу. Вел ут рецтеяуе малуиссет елояуентиам, но путент перицулис сусципиантур меа, ад усу етиам убияуе аццумсан. Ест яуаеяуе дигниссим инцоррупте ут, сеа еу долорес адверсариум, дуо тантас еверти дефиниебас ан. Ет при иисяуе еяуидем, еу яуаестио тхеопхрастус сед, ерудити цонцлусионемяуе еу еос. Ассум яуаестио не про, ан сале хабемус перфецто яуи, ут при хомеро фабеллас. Про еу патриояуе сцрипторем, ностер аудире ид яуи.
Усу ат иудицо елецтрам, еум модус путент но. Яуи яуод лаудем губергрен ет. Сит цу еффициантур цонсеяуунтур, еум апериам медиоцритатем ан. Вереар десеруиссе мел цу. Яуи лобортис импердиет ут, сед ан виси фацер импетус, ан ессент регионе маиестатис меа.
Нуллам аперири ерудити яуи ан. Про еа иллуд цивибус демоцритум. Вел миним лаудем урбанитас ут, ин хас поссим перфецто. Ин еррор цопиосае перпетуа сед, хис ин опортере реферрентур тхеопхрастус, яуот утрояуе еа меа. Ан алиа деленит яуи, ат мазим тимеам интеллегам при, инани лаудем еа при. Ад при солум перицула.
Сит не дицерет антиопам ассуеверит, про ад суас еффициантур, вис пондерум ехпетендис но. Сеа ассум дицант ехерци еу, нец хинц сцрибентур ут, аетерно санцтус ад сед. Солута дицерет вим ех. Сит не еффициантур волуптатибус. Усу еи семпер посидониум.
Меи нострум интеллегам ин, ут про сале цоммодо делицата. Нец неморе лобортис делицатиссими ат, сит солута алияуид ехпетенда те. Аутем сцрипта ад цум, но яуо дицат цонцептам. Анимал цонсететур еа ест. Еи яуи тота орнатус.
Етиам елеифенд вел ан, еа сеа реяуе фацилисис. Суммо аппетере репримияуе пер еу. Моллис видиссе патриояуе сед ут, ат при воцент делецтус губергрен, дебет персиус диспутатиони нец еа. Ин меа поссит ноструд еуисмод, мел цоммодо сингулис оцурререт ид. Ан хис юсто.

GREEK
Λορεμ ιπσθμ δολορ σιτ αμετ, θβιqθε περιcθλα αλιqθανδο ιδ σιτ, γραεcισ σαλθτατθσ ιδ μελ. Μει θνθμ εραντ αδιπισcι cθ, ηασ ατ ειθσ qθιδαμ θτροqθε. Εξ ηαβεμθσ νομιναvι μεδιοcρεμ qθι. Qθοδ ομνεσ ερροριβθσ πρι ιδ, νε αφφερτ φεθγιατ ηισ, vιδερερ vιvενδθμ cονvενιρε τε ιθσ. Εστ εθ cιβο ινvιδθντ cοτιδιεqθε, ιδ qθοδ εσσε ετιαμ προ, ηασ εξ νοστρθμ ρεπρεηενδθντ. Αν ιντελλεγατ vιτθπερατα qθο, ιλλθδ θταμθρ μεα ιν.
Προβο περcιπιτθρ ιδ εστ, εστ ιν qθανδο νθσqθαμ μοδερατιθσ. Qθο πθτεντ ασσεντιορ cθ. Περ εξ εροσ μινιμ, vιξ αδ σθμο vιδε νιηιλ, νιβη σιμιλιqθε γλοριατθρ νεc ατ. Σθμο ιδqθε εθ θσθ.
Ει μεα ορνατθσ δετραξιτ πηιλοσοπηια. Εοσ φαcερ vενιαμ εvερτιτθρ ει. Σθμμο λθδθσ τε σεα, εθ vιμ ρεβθμ νθλλα, cθ cαθσαε περιcθλα σιμιλιqθε σεδ. Vελ ιν vερο ηαρθμ αππαρεατ. Cθ σιμθλ σαεπε αππετερε ιθσ, ιδ στετ φεθγιατ μελιορε qθο.
Αδ νοβισ δοcτθσ προβατθσ μελ. Νισλ στετ προβατθσ ιδ qθι. Παρτεμ δοcτθσ ηενδρεριτ qθι νε, ναμ ει διcατ φαcετε, στετ λθcιλιθσ εθ vιξ. Εροσ μενανδρι αδιπισcινγ εθ μεα, νε μεα προβατθσ cονσεcτετθερ. Qθι ατομορθμ τορqθατοσ vιτθπερατα ει.
Εσσεντ vοcιβθσ γραεcισ ατ περ, cομμοδο δολορθμ εα vιμ, vολθπτατθμ vολθπτατιβθσ θτ νεc. Εοσ cλιτα σιγνιφερθμqθε αν. Τραcτατοσ μνεσαρcηθμ vιτθπερατοριβθσ τε μελ, ιν ιλλθδ πριμισ cοπιοσαε ηισ, ιθσ νθλλαμ ταcιματεσ ει. Διcο αγαμ σενσεριτ αν περ. Εξ μεισ φεθγαιτ ηασ.
Σεα vιρισ πθταντ μνεσαρcηθμ αδ. Μεα ιπσθμ cλιτα αθδιαμ ατ. Εα αδηθc λατινε qθαεστιο εστ. Cθμ λθδθσ λαθδεμ ασσεντιορ εξ, νε μελ σεντεντιαε περcιπιτθρ δισσεντιετ, αν πρι προμπτα ιραcθνδια. Ναμ νε vολθπτθα ινcορρθπτε, ετ νεc cοπιοσαε ινcιδεριντ δεφινιτιονεσ. Θτ εστ τολλιτ δεφινιτιονεσ.
Μελ εξ ιγνοτα ταcιματεσ, ιθσ σονετ προβατθσ αργθμεντθμ αδ. Νε δεβιτισ πραεσεντ θσθ, ιισqθε τριτανι ταμqθαμ ει qθο. Εvερτι δεσερθισσε εθ εαμ, εθ εοσ vιρισ σcριπτα σαπερετ. Vιμ δετραcτο vθλπθτατε αδ, λιβεραvισσε τηεοπηραστθσ δελιcατισσιμι νε qθο. Εαμ σολθμ δεσερθντ ρεφορμιδανσ ει, ετ εθμ δισcερε βονορθμ, θσθ ειθσ αλιqθιδ φεθγαιτ θτ.
Τιμεαμ φαστιδιι cομπλεcτιτθρ εθ vισ, vελιτ σιμιλιqθε αππελλαντθρ σιτ τε. Θτ εοσ σαπερετ εξπλιcαρι. Εξ δεσερθισσε θλλαμcορπερ ναμ, vιξ νε μθτατ ερρορ vολθπτθα, σθμο δεμοcριτθμ σεδ τε. Νε θσθ νονθμεσ οπορτερε. Νοβισ ριδενσ cαθσαε ατ vιξ, θτ αδηθc φαβθλασ ιθδιcαβιτ εθμ.
Μελ εθ νοβισ μνεσαρcηθμ, θσθ cθ ιθvαρετ πατριοqθε, νο ναμ ελειφενδ qθαερενδθμ. Νεc νο νθλλα cηορο, θσθ ιλλθδ ιμπεδιτ cονσεcτετθερ νε, ιν εαμ σιμθλ σολετ φορενσιβθσ. Σθμο αδηθc πλατονεμ vελ ετ, νο ποσσε αccθσατα ναμ. Εθ οφφιcιισ φορενσιβθσ νεγλεγεντθρ μει, πρι νο ηομερο φορενσιβθσ. Θβιqθε λαβιτθρ αccομμοδαρε νο εθμ, μει θτροqθε ινιμιcθσ νε.
Ποσσιμ cονvενιρε ρεφερρεντθρ εα cθμ, λιβρισ νεμορε οφφενδιτ εξ qθο. Vισ cονσθλ βονορθμ επιcθρι αν, πρι vιvενδθμ vιτθπερατα θτ. Εοσ αγαμ νθλλα διcαντ ατ, εξ ηασ δθισ πλατονεμ σαλθτανδι, ετ vιξ cομμθνε περcιπιτθρ cονστιτθαμ. Θτ περ σαλθτανδι.

GEORGIAN
ლორემ იფსუმ დოლორ სით ამეთ, იფსუმ ელოყუენთიამ ეა სეა. სუმო ბრუთე ფერციფითურ უთ ვიმ. ნე ყუი ფერსიუს ერუდითი იმფედით. იდ მეა რეგიონე ალიყუამ, ეუ იდყუე სოლუთა ვირთუთე ვის, ბონორუმ ინიმიცუს ნეც ეა. მეი ეა ნომინავი ინვენირე, უსუ მალის ერანთ ეხ, თე სედ ფაცერ სადიფსცინგ. ნამ მენთითუმ ფრობათუს ეუ, ფერ ერათ ყუას ეა.
მოდუს ელეიფენდ რეფრიმიყუე ჰის ნე, ფრი ათყუი ერრორ იგნოთა ნე. ყუი ვივენდო ნომინავი ფორენსიბუს უთ, ან ფაცერ ფლათონემ ფერიცულის ეუმ, ეიუს ვოლუფთათიბუს ნე დუო. ველით ფერიცულა ვითუფერათა ნეც ნო. ყუი თოთა მოვეთ თე, ფრი უთ ფურთო ფუგით ობლიყუე.
იდ სონეთ ელაბორარეთ ფერციფითურ ყუი, ფრი ეა ვიდით ალთერუმ, ეოს ილლუმ ალიყუანდო ეი. ალიი ალთერუმ ეამ ან. მენანდრი ცომფრეჰენსამ ნო ვის. უთ ერათ ესსენთ მელ. ჰას ათ ყუაეყუე მნესარცჰუმ თჰეოფჰრასთუს, გრაეცი სალუთანდი ინთერფრეთარის ვიმ ან.
ფერ ეხ სცრიფთა ალთერუმ. ეი ვირის რეფრეჰენდუნთ ფერ, ეხ უსუ გუბერგრენ ფერთინაცია. ფერ იდ ცონთენთიონეს ვითუფერათორიბუს. ნეც ეხ ანთიოფამ რეფრეჰენდუნთ, ალიენუმ სინგულის ფართიენდო ეუ ვის, ეუმ ნე ლაორეეთ თრაცთათოს.
ველ ნე ლაბორამუს ინსთრუცთიორ, ეა ეოს მენთითუმ ფჰაედრუმ არგუმენთუმ, ფერ ყუოთ ინერმის ათ. ად იუს უბიყუე ნუსყუამ ცომმუნე, უსუ თრაცთათოს იუდიცაბით ცუ. სედ ნო თიბიყუე ცონსთითუთო, ველ მაიორუმ აცცუსამ ეურიფიდის ად, სუმო ვიდით რეფრიმიყუე ნო ფრო. ნისლ ვულფუთათე ცუ ნამ. დელენით დოცენდი ცონვენირე ინ ესთ. ეუ ვიმ ეროს ნოსთრუმ ცონცლუსიონემყუე, ფეუგიათ დემოცრითუმ სცრიფთორემ ფრო ად, უთ ნეც დიცუნთ ცოთიდიეყუე.
ეი ფლათონემ ვოლუფთარია ეუმ, ან ფაბელლას ყუაერენდუმ ფრი. ეხერცი მოლესთიე ყუო ან, ნე ფერ ლაბორე ყუაესთიო, ეხ იგნოთა დელენით ოფორთეათ ნამ. საფერეთ ოფორთეათ ცონსეყუათ ეხ იუს. იდ ბრუთე ანცილლაე სენსიბუს მეი, ვიმ ეი ყუოდ ანთიოფამ, მეი უთ ინცორრუფთე ეფფიციანთურ. დიამ ალიყუიდ ვივენდო ან ესთ, ეუ ვიხ ეხერცი სიმილიყუე ფერსეცუთი.
მოვეთ დენიყუე ოცურრერეთ ველ იდ, გრაეცის ევერთითურ ეხ მელ, იდ ცივიბუს ფუისსეთ ყუო. ნო ჰაბეო დესერუნთ მეა, ლაბორე ობლიყუე ცონსეთეთურ ეა დუო. სედ უთ სთეთ ყუანდო, იუს თე იუვარეთ ფაბულას, ციბო მოლლის ფერციფით თე ესთ. ეხ ფერ ნისლ დოლორეს ვულფუთათე, ეირმოდ მედიოცრითათემ ცუ ვიმ. ნო ეოს უნუმ ჰომერო ნოსთრუდ, იმფეთუს ფერიცულა რეფერრენთურ სით ეი. ინ აფერირი ფეუგაით ფერ.
ადიფისცი იუდიცაბით იმფერდიეთ ნეც თე. ვის ან სოლუთა თამყუამ ფრომფთა, ეოს ოფთიონ იმფეთუს ან, ვიხ ყუის უთროყუე ად. ეხ უნუმ ფეუგაით მედიოცრითათემ ჰის, ან ჰის ომნიუმ დებითის ათომორუმ. ად ვიმ დელენით მანდამუს, ეხ დეთრახით ეხფეთენდა ცონთენთიონეს ეოს, დიამ ლათინე ნეცესსითათიბუს ვის ეი.
სედ აფეირიან ცონსეყუუნთურ იდ. ეირმოდ ვულფუთათე ესთ ეა. ათ სეა ადიფისცინგ აფფელლანთურ, ჰის ინ მუნერე ფერთინაცია სცრიბენთურ. იუს თე სიმულ ვიდერერ მედიოცრითათემ. ფერფეცთო მედიოცრემ ფათრიოყუე ვიხ ეი, ეამ ფრობო დოლორუმ ეხფეთენდის უთ.
სეა ცივიბუს ცონსეყუათ აცცომმოდარე ეა. ბრუთე თემფორ უთროყუე ყუო ეუ. ეხ ერრემ აფფეთერე მელ. ვის სოლეთ ინთელლეგათ.

ARABIC
شدّت ويكيبيديا ذات ما. وعُرفت بلديهما ثم نفس. هو كما هنا؟ بمعارضة. الأول المتاخمة أن الى, بوابة واحدة الشرقي وصل ما, ان لغزو شاسعة الأحمر تعد. ماشاء وإعلان المتحدة في على, ما التي اتفاق فصل. دنو عل مليون أوزار للإتحاد, عن فقد مكثّفة الشتوية, من كلا للحكومة ومطالبة بريطانيا. السبب والكوري دنو في.
أخر جمعت لفرنسا المزيفة عن, وتم للحكومة التبرعات لم, قام عل اعتداء العالمي وفنلندا. مسرح وإعلان وبولندا من مكن, وحتى بداية المنتصر تم مدن. ٣٠ إعمار الستار موالية بحث. لدحر تحرّكت ومحاولة أي يكن, وجزر وقبل الأولى كل الى, حتى عن بسبب وجهان. وسوء سليمان، و دار, ومن من أحدث بالحرب والمعدات, تحرير انتباه الثقيلة بـ كلا.
مشروط فقامت أي انه, أخر ٣٠ أراض السيطرة, لأداء الخاسرة الأرواح ٣٠ حدى. مع الأمور معارضة الأرواح حين, فشكّل كانتا الشرق، ان لان. وقبل مشاركة الطرفين دون قد. فصل تكبّد مليون الحكومة مع, يذكر اليابان الجنرال حين في.
عُقر تعداد الطريق مكن أي, تُصب الأول الساحلية بين عل. دول بفرض أسيا بقسوة تم, فصل ما تطوير اعلان الساحلية. يعادل مهمّات والنرويج بـ يتم, شيء عل أمّا وحتّى فقامت, بينما الإكتفاء الأوربيين عل أضف. بل قبل إعمار الربيع، الأوروبية, دول من طوكيو أجزاء. في بالرغم ومطالبة بعد, مع خلاف أوسع أعمال غير.
لها كل ثمّة أسابيع بقيادة, وحتى وبريطانيا حتى ثم. إعادة استراليا، بال ثم. غير بل ا المشتّتون, بال عن ثمّة وزارة ويكيبيديا،. ان أعلنت السفن مشاركة مكن.
تشكيل بالحرب شيء من. تنفّس لعملة وفرنسا قام عن, ٣٠ يبق بزمام تزامناً استعملت. ضرب اللا الشرق، العالمي بل. حيث و إعلان وبالرغم الأرضية. أمام الأرض معارضة من بعد.
رئيس والقرى سنغافورة عدد مع. ما بحق جنوب جديداً. أواخر نهاية أم هذا, لكون ليرتفع وتتحمّل أن ذلك. بحث يتمكن تكاليف قُدُماً بـ.
فقد بل بشرية الإنذار،, عن الا جديداً تكتيكاً, وعلى الخطّة الجديدة، جعل تم. مع مكن وجهان الثقيل, بها صفحة الدول بالجانب عل. انه الثالث الخاصّة ثم. تكبّد الأولى عدد ثم. في الحرة بلاده غريمه وقد, كل كانتا بالعمل لمّ. النزاع والروسية والفلبين قام إذ. وفي ا المواد الشرقية هو, العالمي اتفاقية الإيطالية بعض كل.
الهجوم اقتصادية لمّ مع, القوى مقاومة نفس ٣٠, بـ لكل بقصف لعملة الثانية. تونس احداث في فصل, أوسع الباهضة إذ مدن. به، حاملات الفرنسي هو, ما وصل لإعلان استدعى, لها كل ويتّفق ا وقدّموا. قبل تم الحرة أطراف عالمية, شاسعة مسارح لهيمنة أم وتم, تم لغزو والعتاد لبلجيكا، وقد. أي على أمّا فكانت الخاصّة, خطّة إعمار ممثّلة بين أم.
بخطوط استبدال استراليا، لها هو, قدما الثقيلة حدى مع, حدى ان بقعة مقاطعة. كل فكانت طوكيو العاصمة لها. ٣٠ وبحلول وفرنسا دول. أي حكومة المارق اقتصادية يبق, بـ تسبب الثقيلة يكن. حلّت معارضة في الى, الثقيل الصينية المتحدة مع حول, هذه الله بريطانيا، تشيكوسلوفاكيا تم.

HEBREW
שמו את החול יוני, חשמל בכפוף קישורים זאת ב. שכל אל בשפות אקטואליה סטטיסטיקה, ספרדית אנגלית מה לוח, כלל דת זקוק חשמל. אחר יידיש לאחרונה של. מה רפואה לויקיפדים כדי, מה קבלו עזרה ויש. פיסול בעברית אנא של, המזנון והנדסה קרן גם. מה בעברית קולנוע בהיסטוריה עזה.
את אחר מיזמי אנגלית הקנאים, ארץ אם מוגש קולנוע והגולשים. אתה ואמנות ייִדיש אירועים בה. בקר ובמתן טכנולוגיה של. כתב על לחשבון אדריכלות, מחליטה יוצרים ארכיאולוגיה חפש אם.
של מיזם לחשבון מדריכים היא, מלא אל ליום פילוסופיה. אנא משופרות לויקיפדים על. צעד קלאסיים בהיסטוריה האנציקלופדיה את, בדף באגים בהתייחסות אל, אל בקר ממונרכיה פסיכולוגיה. אינו טיפול את זכר, מה כלל והנדסה תבניות. על שער למנוע מועמדים. דת חפש ערבית המזנון תיאטרון, שימושיים אנציקלופדיה ב שער, או החול משפטים היא.
על יוני ויקימדיה אתה. את חפש בשפה לחשבון תחבורה, כלל לציין ביוני לויקיפדיה מה. גם שער פיסול לעריכת מדינות, מלא אם תבניות חבריכם לעריכת. יסוד להפוך אווירונאוטיקה זכר ב. רבה גם ברוכים הגרפים, תנך דת ראשי ביוני לטיפול. רבה על אחרונים נוסחאות למתחילים.
בה זאת הבקשה המלצת, מה יוני המדינה מדע. כדי ב אחרות פוליטיקה, חפש על רקטות תרומה מיוחדים, שנורו מונחים שימושי זאת של. שמו ויקי לערך אם, של אתה דרכה התפתחות. הרוח לחבר תאולוגיה דת מתן, מלא טיפול מוסיקה תאולוגיה מה. אנא למנוע פיסיקה ומדעים גם.
העמוד מוסיקה זכויות כלל בה. שכל של הבהרה וקשקש מועמדים. מוגש בדפים עזה אם. מלא ב להפוך בדפים ויקימדיה. ארץ או תוכל אנציקלופדיה, בדף או יסוד משפטים והנדסה.
רב־לשוני סטטיסטיקה גם זאת, מדע פנאי שימושי אספרנטו בה. קרן גם המלחמה מרצועת שימושי, חפש צילום יוצרים של. לוח כלים ברית אם, בקר הארץ קרימינולוגיה אווירונאוטיקה או. דת שמו רקטות והנדסה. או מאמר מיזמי תיקונים קרן.
מלא קסאם רשימות אל. של אחר ניהול תקשורת. עיצוב הנאמנים דת סדר. צעד בה לחשבון לאחרונה, דת ארץ זקוק ספרדית ופיתוחה, עזה על העמוד מוסיקה פסיכולוגיה. ביוני פולנית היא דת, מוסיקה תאולוגיה ארץ ב. ב העמוד חופשית מאמרשיחהצפה עזה.
תנך מה אחרים ופיתוחה, אל כלשהו אדריכלות תאולוגיה שתי, מושגי אקראי אדריכלות או צ'ט. והוא פיסול בהיסטוריה שמו גם, אם שכל לראות הראשי הגולשות, יכול ולחבר דת ויש. דרכה הסביבה אחד דת, כיצד אספרנטו דת לוח. מדע היום מרצועת דת, מתן גם בדפים העריכהגירסאות. כדי בה תרבות לעריכת.
בה כדי שונה סרבול שימושי, בה לשון מיתולוגיה עוד. שתפו אדריכלות גיאוגרפיה שמו דת, שער דת לחיבור ואלקטרוניקה. עוד או בישול המדינה, אנא המזנון למתחילים אל. המשפט בדפים גם אחר, על לערוך רומנית רב־לשוני שמו. בדף החלה המקובל בלשנות גם, אתה דת כלשהו צרפתית, זכר את להפוך קצרמרים תאולוגיה. ב קרן מפתח עזרה מיוחדים.

HINDI
कारन विवरन विज्ञान सोफ़तवेर विश्व शारिरिक कार्यकर्ता गएआप उपलब्ध गयेगया सोफ़्टवेर औषधिक विषय मुख्य खयालात गोपनीयता जैसी मजबुत पुर्णता प्राधिकरन नाकर सुचना सकते शुरुआत बातसमय असक्षम आजपर देखने नयेलिए गोपनीयता पहोच। पुर्णता ढांचामात्रुभाषा अधिक हैं। बनाकर संपुर्ण बीसबतेबोध संदेश हुएआदि असरकारक लगती अतित कार्यलय संस्थान बढाता काम सदस्य तरहथा। हुएआदि भोगोलिक खरिदे अंतर्गत एकत्रित प्रतिबध नीचे अपने द्वारा और्४५० स्थापित समाजो
बहतर सभिसमज सुस्पश्ट कार्यसिधान्तो विवरन सके। पहेला संपादक केन्द्रिय हमेहो। एसेएवं खरिदे हैं। चिदंश हुआआदी कम्प्युटर व्याख्यान खण्ड आवश्यकत लाभान्वित पसंद सहयोग दिये ढांचा ज्यादा केन्द्रिय किके लचकनहि आशाआपस मार्गदर्शन कराना दारी विवरन परस्पर ज्यादा वर्णित कीसे पासपाई व्रुद्धि कार्यसिधान्तो डाले। माध्यम लचकनहि हमेहो। समाजो कलइस जिसकी सकता विकासक्षमता विश्वव्यापि वर्णन तकनिकल स्वतंत्रता जाने उनका माध्यम मानसिक व्यवहार बलवान सहयोग कैसे निर्माण कार्यलय
हमारि वहहर आवश्यक भोगोलिक अंग्रेजी समाज दोषसके कार्यलय मजबुत मुखय खयालात विनिमय जिसकी सम्पर्क पुर्णता कार्यसिधान्तो तरीके कारन मुक्त आधुनिक निरपेक्ष हैं। ७हल संसाध गुजरना जागरुक चुनने आवश्यकत सम्पर्क किया प्राण सकते संस्थान सुचनाचलचित्र भारतीय कम्प्युटर अथवा खरिदे समूह आधुनिक निर्माण संसाध किया संपादक असरकारक संस्थान डाले।
सहायता बेंगलूर प्राथमिक विषय होसके बाजार खयालात विज्ञान प्रतिबध्दता भीयह उसके विभाग विकेन्द्रियकरण ढांचामात्रुभाषा कार्यलय प्रतिबध गोपनीयता चुनने भीयह काम बलवान सारांश आधुनिक सभिसमज आंतरजाल मुश्किल करता ध्येय जाने विनिमय प्रौध्योगिकी भाषाओ गुजरना आधुनिक सादगि रचना समाज गुजरना विस्तरणक्षमता सीमित अनुकूल मर्यादित कराना बाधा लेने आवश्यक दस्तावेज निर्माता विवरण
अनुवाद निरपेक्ष संसाध समूह विवरन सेऔर उपलब्धता प्रतिबध्दता करता। बहुत आधुनिक जानकारी प्रौध्योगिकी जाता सदस्य यायेका स्वतंत्रता ध्वनि करती आवश्यक बेंगलूर जाता मुक्त पुर्णता संस्क्रुति अन्तरराष्ट्रीयकरन बेंगलूर संपुर्ण होने देखने करता। करके कार्यलय केन्द्रिय स्थिति पत्रिका उपलब्धता विकास बहुत अनुवाद माहितीवानीज्य मुख्य रिती बनाने एछित मुश्किले बिन्दुओमे
स्वतंत्रता कार्यसिधान्तो हिंदी बाधा डाले। लोगो स्थापित विस्तरणक्षमता करता सादगि विज्ञान विकासक्षमता ज्यादा सोफ़्टवेर भाषा समजते प्राण २४भि स्थिति जागरुक हार्डवेर
होसके सुविधा एसेएवं वास्तव सकते कीने ऎसाजीस दिनांक शीघ्र संभव मजबुत गुजरना और्४५० प्रतिबध भेदनक्षमता प्राण बाधा उपलब्ध प्रदान उन्हे सकता प्रति गटको अधिकार बातसमय बेंगलूर जाता स्थिति प्रतिबध करता। अन्य समजते उपेक्ष व्याख्यान
मुख्य ब्रौशर दोषसके बीसबतेबोध भीयह मुश्किल बिन्दुओमे संस्क्रुति कर्य विकास प्रदान किएलोग प्रतिबध्दता उशकी उन्हे विश्व प्रमान शारिरिक जिसे उनका पुस्तक यायेका सहयोग नाकर मानसिक प्राथमिक चिदंश आपके हिंदी गुजरना पत्रिका मर्यादित शारिरिक मुश्किले प्रौध्योगिकी लिए। बढाता हीकम बाजार सोफ़तवेर सम्पर्क सहयोग कीने आंतरजाल शारिरिक व्याख्या प्रमान गटकउसि तकनिकल ७हल बाजार
बनाने ऎसाजीस अनुवादक अधिकांश देकर और्४५० तकनीकी पहोच। बिना गटकउसि विश्लेषण सादगि सकते देखने करेसाथ वास्तव क्षमता। सकता अत्यंत दोषसके वार्तालाप यधपि समाजो केवल अनुवाद आवश्यकत अधिकांश विकास उनको संपुर्ण भेदनक्षमता बलवान करता। ७हल माध्यम रहारुप आंतरजाल भीयह बढाता रहारुप सभिसमज एकत्रित कारन खयालात प्रतिबध्दता जानते विभाग बहतर उद्योग वर्णित यायेका
भाषा विश्व पहोचाना दस्तावेज स्वतंत्रता लक्षण स्वतंत्र विस्तरणक्षमता उसके पहेला पढाए आधुनिक लाभान्वित अन्तरराष्ट्रीयकरन जाएन विश्व सारांश हुआआदी समस्याए दर्शाता समस्याओ हार्डवेर बाजार लिये वेबजाल आधुनिक खण्ड हमारी पत्रिका बेंगलूर करता। समाज शीघ्र असरकारक निर्माता मानव

JAPANESE
図ぜッ摩注本ん打携ヱタセ窯27年ニタヤコ容仏すみぼば抜英チ施48一ケセ族所ちぽーひ性凝ニ版天まぜつス入標提タチ写男さおた際千報ハ連憂版ヤヌ近床鋭奪裏ざくぴド。激純づおド治図ぽ文害ウネマ無急メウ堀中ヌリ討賀準こ拘出き化善一ごでせ関71家静サ身明こ也光ネヤ倉同ばづ以都ぽドほね。
部ルぱン新将シ事構かきくゅ自導び道般レぜみ集単ソテハ提面5真フぽろ率急ヲタ返東ソネクル人属ぽく更彦報那シ感関はき南嗅さだやあ。昨徳幕メ靖答方79局者ッだト区子び続禁りンさ英両げぎッ列米ヤノモム万経し南86眼殺ぴひそッ査流スミ音各だ輝謙召喝こらくめ。42他ラシ屋市ハ気人ヌ政去ほえ触近モ愛島イがゃだ読過ロエマ講軍くずを手確ざトにの番席カト話24背ミ多負仰巣ほぞぼ。
6胆ほちク能戒ネ康絵ヲケル転府だもみそ線新リ記催4夫ロラ更情でお湘32食ワヘコ淵暇典やぼ毎給ねみだ人展サノ手開っめき。動ぞス一藤づラけぴ明平問ヲコ万1報じぎ守人ムヤナ覧9外が本城採さト園読泉タ控球せげぱ能投ドざ同年ぜら提党ヲチヒヤ不惑べ聞性吏坦峠もぶみ。鋭最げ属谷ノテニス強港作ケワイア聞初ヒキヌム強稿チテア立統だづま統現ミレヤク工理ヒ文月ね敷二寄静察ゆクり。
店ナロニ多検ヱレワ条相スうま都者翌もす制58新イふすぴ音高者どつ前賞ほさする弘8広ト曲更ノヒヤ彼皇索佑っスげふ。48剰ワマヲ院90深トでぞ練位を必真ンレルど世与任豊ド問刊ほよ設秀レぞッ崑久ミリソ更津装りせラす。擁打れスいさ遊古ヤナ陸一イナ津自ツワイ進気いぎきド禁払ぼぞ井海稲マ北余変てゆそざ暮守ヲケ客円島シレネ伝下ロナレム策高びっッ版支冒培慢ごな。
上供ツルホ済著しスす鎮造カエ気種俳ロコ展76酷ルムメツ霊初じ入2発ウフホ住56聞題ルぜっ家1左トや能秋い小病原むじ先達ちせの。趣キフホ稿記よレや督属ひ時災雪ッた点役トレぴゃ読93出ろ良設ユニ載勘がで棋更列ンあすせ朝気ワテロタ日渡ヱイシツ感佑をトょま。施応ナツカハ恋作うルえ音残ウセツマ疑話そんびけ際館ウヨアメ禁年で見理はぐ秀品らだじ本反権六リヘイ金復ヲ常同コキ異敷打字真ぞレ。
温ルフエ日道先だぴゃあ片代タメ闘横46劇くドわ話裁るてそず余念ぐせむ人在集上トぐる会港フツコヘ伝図イみ薄創げスに犯務フマモ最表なじ真優ッへねく館強メ込競ぼぱ。織びぎ延援ルに代郎ヲワ賃上ホユヘ米71逃ヨミ公申アヱネ遺京ずこうひ参険たぶむ港本ゅ棋1写をげあレ悼20関輸嶋そッう送帯ヨヤ供量略互へ。
積キモ禁60促ぱしふ者入サ紀長ク図国ハヨラ氏質報ーき度過レチヤ断87撲威や勝厘架肥ょろ。朝ぴま験7走テマ改載をさクえ設未ヱタヲホ京念シア小水トと原間ルずめ活内ナム貢系エユ紙掲ワ本測少時ぎルッほ道行求亨けルばぞ。東みのに良放レチヲス与転招くてにい士事じ顔請仙イはと校筋ぶン会済フ見売とずぎん政前レごっべ同空ハセ国供だ秋索ぴ行雑百ッ目98勝力尊位4意偵トばこ。
延セキ続疲のょぶず回党きた生戦マホメ経積セ析固敏ご五祭オケニコ阪開ドスゆ一数む像89歴ツ停4毎芸もよやー楽4学要ホヲ線遠ま映持ざ。村ゅちル聞禁登シアユナ励渡方ク姫手務ソ費温びご強界たレ中先じんお利投でじ間済ワスキヲ余抽レやぶ。質野じ事頼わしむ都3一サマチナ明提ラヘケフ空7回様ルネホ長聞モ樹疑べはれび佐九平なべゃ止料ぽぞむ夜済タホフツ不不コヌノ宅咲あゆぞリ。
減暮チシ伝日づ説近あに皇問ウオニ爆予使ユ二務新ソ女会ろず年人べスぐさ集買うげゅ印探イ海英払縄株めそとせ。探ムロウ報原推すがま表5題だす府路8性勧ヱ経児ちてま安任トらせそ車略レヤ周票8方ホサムセ約厳早条偽ぴめひ。倍ぴたゅル毎投員へらいッ後9料アソヌ縮合き機山まだぐは基手わく出質むふを強堂ッけ新顔上コレス責転マセウヌ神権コカアウ選歩エホテフ出件ら覧名ぽーとき題87戸シトコ連宿寄めび。
仙ラヘヱタ聞台ヲレヤ共置円とにレ供特て著集イヨウラ致98乗そげにむ関球ッ福成コネル競報つろしス禁演政ロチアホ全趨さしぱに郷抜キ進紀スム宏5郎読析毛龍たらち。卒セエ広科はょじ読名ゅあ柄広用よゃ文成情働ヱクツラ電自イざレこ万話びらへ開有ぽだ通相マアラヒ朝専泉抑ンべ。以じラ公泉ユハソロ国8辺16白れ認8準ミユセ給米が権紀属お事選クルユ覧弟テアヒ込怪こに皇清で価省企ン。

KOREAN
법률과 적법한 절차에 의하지 아니하고는 처벌·보안처분 또는 강제노역을 받지 아니한다. 경제주체간의 조화를 통한 경제의 민주화를 위하여 경제에 관한 규제와 조정을 할 수 있다, 대한민국의 경제질서는 개인과 기업의 경제상의 자유와 창의를 존중함을 기본으로 한다, 우호통상항해조약.
군인은 현역을 면한 후가 아니면 국무총리로 임명될 수 없다, 법원은 최고법원인 대법원과 각급법원으로 조직된다, 정당의 설립은 자유이며. 행정에 관하여 대통령의 명을 받아 행정각부를 통할한다.
예비비는 총액으로 국회의 의결을 얻어야 한다. 제3항의 승인을 얻지 못한 때에는 그 처분 또는 명령은 그때부터 효력을 상실한다. 그 정치적 중립성은 준수된다, 법률이 정하는 바에 의하여 대법관이 아닌 법관을 둘 수 있다.
농지의 소작제도는 금지된다. 사면·감형 및 복권에 관한 사항은 법률로 정한다. 헌법개정안이 제2항의 찬성을 얻은 때에는 헌법개정은 확정되며, 언론·출판·집회·결사의 자유.
중임할 수 없다. 탄핵소추의 의결을 받은 자는 탄핵심판이 있을 때까지 그 권한행사가 정지된다. 국군은 국가의 안전보장과 국토방위의 신성한 의무를 수행함을 사명으로 하며. 국가원로자문회의의 의장은 직전대통령이 된다.
형사상 자기에게 불리한 진술을 강요당하지 아니한다. 비상계엄하의 군사재판은 군인·군무원의 범죄나 군사에 관한 간첩죄의 경우와 초병·초소·유독음식물공급·포로에 관한 죄중 법률이 정한 경우에 한하여 단심으로 할 수 있다. 모든 권력은 국민으로부터 나온다, 법관은 탄핵 또는 금고 이상의 형의 선고에 의하지 아니하고는 파면되지 아니하며.
대한민국의 주권은 국민에게 있고. 대통령의 국법상 행위는 문서로써 하며. 그 임기는 4년으로 하며. 이 헌법시행 당시에 이 헌법에 의하여 새로 설치될 기관의 권한에 속하는 직무를 행하고 있는 기관은 이 헌법에 의하여 새로운 기관이 설치될 때까지 존속하며 그 직무를 행한다.
감사원은 세입·세출의 결산을 매년 검사하여 대통령과 차년도국회에 그 결과를 보고하여야 한다. 국가는 균형있는 국민경제의 성장 및 안정과 적정한 소득의 분배를 유지하고. 대통령의 선거에 관한 사항은 법률로 정한다. 다만.
경제주체간의 조화를 통한 경제의 민주화를 위하여 경제에 관한 규제와 조정을 할 수 있다. 감사원은 원장을 포함한 5인 이상 11인 이하의 감사위원으로 구성한다. 국가는 지역간의 균형있는 발전을 위하여 지역경제를 육성할 의무를 진다. 원장은 국회의 동의를 얻어 대통령이 임명하고.
제1항의 지시를 받은 당해 행정기관은 이에 응하여야 한다, 국회나 그 위원회의 요구가 있을 때에는 국무총리·국무위원 또는 정부위원은 출석·답변하여야 하며. 다만. 국민의 모든 자유와 권리는 국가안전보장·질서유지 또는 공공복리를 위하여 필요한 경우에 한하여 법률로써 제한할 수 있으며.

CHINESE
稿質検画入自郎提住協件全容図粘周名気因写。籍態内吉記兵分撃読済客衆軽法開奈蝦観前毎。講内単文資暮敬客名般属察回育植質。野回躍家付禁真受若沢反供末出。発苦除経工織静一侵変語下極冬案飛容通。政度総東不健薄台六新育欺。静黄減政焼提価看選発懲党責条味学表。政図大惑達都区宅再上高売体聞申俳教自就。紀厚禁需舗止地額容毎疑政単表。
営金断将取多子担暮認防設岡覚救金似掲念。戦乗率約四常議戒治来無獲舞属。治徴冬慎坂辺開発終仮台盛脱組。第勝情割早紙面注原院根英神断児卒面査。気逮返全作中献試私力裕除下国帳社浴禁。結講給該区賞鉄結毎碁値点。度別華第府自趣色調年留著舞保人行棄歌。宇基作理載放問渡発告実統供呼唱報計。面一快望開売断絡芝質著元恵替試転快処確課。
後更制造据由第墜自質進際交御治形。現岩聞輪言台兵保能線所止記管。必方官画四後党者京松相検量道掲暮本。科見権載大界少写齢置答無然約芸。界覧候芸史約尾報所傷全休点。再一汚負断主髪一術提遺利索文足都誰今。違平参施芳影逆作近視歳力西暮場府大。展紙刻文執権衛野熱淳稿会場。今議時北捕広負田乗格稿失声調消支金材合加。
産康会星象清見投嫌京謙作封史。情全勝旅弱早氏列堀無暮治学断経。部費第頭闊質俊従選範優生室中畏。載宜港堀満加指否倉著頭注訴歌義降過著未夜。川親久全気轄田吸農掲暮学映芸系記質進性。以題事保関一情岡負支信皇契。仕紙可凶北止問教変違有当婚所。革着形成豊直護競岸平通百。護主辺景風純皇録医意外巻母判意市育新予。
町東決掲化所集受療遅車真女予関。回氏帯人神定犯室講作社壊願有変書次。強忠徴険使目生際高出彼奈。直増格著選色橋転作育経襲臓井内。事新事明地話食視計地判和収強。員北格者読休市下掲設者真著点会。闘無報森体内際町狙国央理保記運時兵要読集。属康可配怠事童買置人歴索成。持険空選向校要互後惑矛鈴気授地無位。出政婦重大月社社間男著職。
上語触者療石広私稿混千取決私浜申経上。更部東信構標政覧田問賞造互願縛全室。済謙考上炭転主気理売作面。定谷載次米直脳競掲開申勝性前芸阪親和。禁強習発説柳場三琶終音富由援社業趣求全面。出髪沢社著物投義茶横掲京勢除務敵固府選人。分陵渕嶺無代脂判任会雑会。球経総中時相解健攻新堤補。更沖雑校並勝住同前別低先色展響力盾。
弘択供聞芸夜更破屋差面聞達業。今済報血騰木神当再汚援鈴雄。人最太以左応区出更備講女販資助容。楽特関参経頭傷活権裕警隆。問載高百語勘技提権集人会構観供停家暦弟。雪件介臨座刊葉広情評討写木委味更載光混単。業陽彼優巡憲熱新見原目告点礎生健済門償六。強虎得組姿東抗川辺副問止質市。家出健著戦東再飛出男宮貴女変葉約主択夜需。
掲以前否無表素約果準団人友区意計未浦締。的法静件月兆娘討子併館市免経天美的嘉近。生著度幅度待男騒幹止効水命設。都犯強気化月四物投面銀気皇職外初。百過本裏面貝出政市白果雪抗青務井地高明。十込輩情内負真幸天函堀史。紙掲半同用男業扱随専人告済才。場熱間装投主春送光森別入氏資奪広円。訴放躍学約性言依棋況六内豊載氏郵政全次言。
案穫刊遂動絶西羽日底続賞景面入有米報昇禁。追尾電今筒関関社民護半再将方際川協。後飯条治購申替時物音県服兆議談思那意。天非欠薬円抑変主誕驚主護正女園。競期答読天教塞読問玉京将戦。界道契写災国区区自可的金投速総海告。仏日者中番界毎線済日面引韓楽最求王図誓株。月協大帯医所弄開台遠治竹児属見当同進和補。
第料愛必放応橋気質上付社完。綱月降球洋回刊脇細浮奏調陣健黒住。国繊武川系車細美浩終太図。別海況堂注情芸芸直朝株論果。官代都抜受圧育棋引性崎見禁票食付活売欲現。楽真暮月通命一香問闘極最。試情無失県前紀田急現合相。刊断対天者価社治月本著高台覧出見行。読覧延東書全面合招芸掲係覇定組国質。会全能裁当顕康氏兵意混前趣第堀紹未日。`);
    // tslint:enable:max-line-length

    function addGUIControls() {
        gui.add(guiOptions, "gridEnabled");
        gui.add(guiOptions, "boundsEnabled");

        guiOptions.color.r = textRenderStyle.color!.r * 255.0;
        guiOptions.color.g = textRenderStyle.color!.g * 255.0;
        guiOptions.color.b = textRenderStyle.color!.b * 255.0;
        guiOptions.backgroundColor.r = textRenderStyle.backgroundColor!.r * 255.0;
        guiOptions.backgroundColor.g = textRenderStyle.backgroundColor!.g * 255.0;
        guiOptions.backgroundColor.b = textRenderStyle.backgroundColor!.b * 255.0;

        const textRenderStyleGui = gui.addFolder("TextStyle");
        textRenderStyleGui
            .add(textRenderStyle.fontSize!, "unit", {
                Em: FontUnit.Em,
                Pixel: FontUnit.Pixel,
                Point: FontUnit.Point,
                Percent: FontUnit.Percent
            })
            .onChange((value: string) => {
                textRenderStyle.fontSize!.unit = Number(value);
            });
        textRenderStyleGui.add(textRenderStyle.fontSize!, "size", 0.1, 100, 0.1);
        textRenderStyleGui.add(textRenderStyle.fontSize!, "backgroundSize", 0.0, 100, 0.1);
        textRenderStyleGui.addColor(guiOptions, "color").onChange(() => {
            textRenderStyle.color!.r = guiOptions.color.r / 255.0;
            textRenderStyle.color!.g = guiOptions.color.g / 255.0;
            textRenderStyle.color!.b = guiOptions.color.b / 255.0;
        });
        textRenderStyleGui.add(textRenderStyle, "opacity", 0.0, 1.0, 0.01);
        textRenderStyleGui.addColor(guiOptions, "backgroundColor").onChange(() => {
            textRenderStyle.backgroundColor!.r = guiOptions.backgroundColor.r / 255.0;
            textRenderStyle.backgroundColor!.g = guiOptions.backgroundColor.g / 255.0;
            textRenderStyle.backgroundColor!.b = guiOptions.backgroundColor.b / 255.0;
        });
        textRenderStyleGui.add(textRenderStyle, "backgroundOpacity", 0.0, 1.0, 0.1);
        textRenderStyleGui.add(guiOptions, "fontName").onFinishChange((value: string) => {
            textRenderStyle.fontName = value;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        textRenderStyleGui
            .add(textRenderStyle, "fontStyle", {
                Regular: FontStyle.Regular,
                Bold: FontStyle.Bold,
                Italic: FontStyle.Italic,
                BoldItalic: FontStyle.BoldItalic
            })
            .onChange((value: string) => {
                textRenderStyle.fontStyle = Number(value);
                assetsLoaded = false;
                textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                    assetsLoaded = true;
                });
            });
        textRenderStyleGui
            .add(textRenderStyle, "fontVariant", {
                Regular: FontVariant.Regular,
                AllCaps: FontVariant.AllCaps,
                SmallCaps: FontVariant.SmallCaps
            })
            .onChange((value: string) => {
                textRenderStyle.fontVariant = Number(value);
                assetsLoaded = false;
                textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                    assetsLoaded = true;
                });
            });

        const textLayoutGui = gui.addFolder("TextLayout");
        textLayoutGui.add(textLayoutStyle, "lineWidth", 1.0, window.innerWidth, 1.0);
        textLayoutGui.add(textLayoutStyle, "maxLines", 0.0, 128, 1.0);
        textLayoutGui.add(textLayoutStyle, "tracking", -3.0, 3.0, 0.1);
        textLayoutGui.add(textLayoutStyle, "leading", -3.0, 3.0, 0.1);
        textLayoutGui
            .add(textLayoutStyle, "horizontalAlignment", {
                Left: HorizontalAlignment.Left,
                Center: HorizontalAlignment.Center,
                Right: HorizontalAlignment.Right
            })
            .onChange((value: string) => {
                textLayoutStyle.horizontalAlignment = Number(value);
            });
        textLayoutGui
            .add(textLayoutStyle, "verticalAlignment", {
                Above: VerticalAlignment.Above,
                Center: VerticalAlignment.Center,
                Below: VerticalAlignment.Below
            })
            .onChange((value: string) => {
                textLayoutStyle.verticalAlignment = Number(value);
            });
        textLayoutGui
            .add(textLayoutStyle, "wrappingMode", {
                None: WrappingMode.None,
                Character: WrappingMode.Character,
                Word: WrappingMode.Word
            })
            .onChange((value: string) => {
                textLayoutStyle.wrappingMode = Number(value);
            });
    }

    function initDebugGrid() {
        gridScene = new THREE.Scene();
        gridScene.add(
            new THREE.LineSegments(
                new THREE.WireframeGeometry(
                    new THREE.PlaneBufferGeometry(
                        window.innerWidth - 1,
                        window.innerHeight - 1,
                        window.innerWidth / 16,
                        window.innerHeight / 16
                    )
                ),
                new THREE.LineBasicMaterial({
                    color: 0x999999,
                    depthWrite: false,
                    depthTest: false
                })
            ),
            new THREE.LineSegments(
                new THREE.WireframeGeometry(
                    new THREE.PlaneBufferGeometry(
                        window.innerWidth - 1,
                        window.innerHeight - 1,
                        2,
                        2
                    )
                ),
                new THREE.LineBasicMaterial({
                    color: 0xff0000,
                    depthWrite: false,
                    depthTest: false
                })
            )
        );
    }

    function initDebugBounds() {
        boundsScene = new THREE.Scene();
        boundsVertexBuffer = new THREE.BufferAttribute(
            new Float32Array(32 * 4 * characterCount),
            4
        );
        boundsVertexBuffer.setDynamic(true);
        boundsGeometry = new THREE.BufferGeometry();
        boundsGeometry.addAttribute("position", boundsVertexBuffer);
        boundsObject = new THREE.Line(
            boundsGeometry,
            new THREE.LineBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.2
            })
        );
        boundsScene.add(boundsObject);
    }

    function updateDebugBounds(position: THREE.Vector3) {
        const vertexArray = boundsVertexBuffer.array as Float32Array;
        let arrayIdx = 0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;

        for (const bounds of characterBounds) {
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
        }

        boundsVertexBuffer.needsUpdate = true;
        boundsVertexBuffer.updateRange.offset = 0;
        boundsVertexBuffer.updateRange.count = arrayIdx;
        boundsGeometry.setDrawRange(0, arrayIdx / 4);

        boundsObject.position.x = position.x;
        boundsObject.position.y = position.y;
    }

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);

        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;
        camera.updateProjectionMatrix();

        textPosition.setY(window.innerHeight * 0.5);
    }

    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();

        if (guiOptions.gridEnabled) {
            webglRenderer.render(gridScene, camera);
        }
        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.textRenderStyle = textRenderStyle;
            textCanvas.textLayoutStyle = textLayoutStyle;
            textCanvas.addText(textSample, textPosition);
            textCanvas.render(camera);

            if (guiOptions.boundsEnabled) {
                textCanvas.measureText(textSample, textBounds, {
                    outputCharacterBounds: characterBounds
                });
                updateDebugBounds(textPosition);
                webglRenderer.render(boundsScene, camera);
            }
        }

        stats.update();
    }

    function main() {
        // Init Three.JS
        webglRenderer = new THREE.WebGLRenderer({
            canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
        });
        webglRenderer.autoClear = false;
        webglRenderer.setClearColor(0xffffff);
        webglRenderer.setPixelRatio(window.devicePixelRatio);
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(webglRenderer.domElement);
        document.body.appendChild(stats.dom);
        window.addEventListener("resize", onWindowResize);

        camera = new THREE.OrthographicCamera(
            -window.innerWidth / 2.0,
            window.innerWidth / 2.0,
            window.innerHeight / 2.0,
            -window.innerHeight / 2.0
        );
        camera.position.z = 1.0;
        camera.near = 0.0;
        camera.updateProjectionMatrix();

        // Init textCanvas
        textLayoutStyle = new TextLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Below,
            lineWidth: window.innerWidth
        });
        textRenderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Pixel,
                size: 8.0,
                backgroundSize: 0.0
            }
        });
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 2048).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: characterCount
                });
                loadedFontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                    assetsLoaded = true;
                });
            }
        );

        // Init Debug Visualization
        initDebugBounds();
        initDebugGrid();
        addGUIControls();

        // Animation loop
        animate();
    }

    main();
}
