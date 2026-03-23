(function () {
  const STORAGE_KEY = "torti-ritual-saved-sheets-v1";
  const ZONE_LAYOUT_VERSION = "cluster-horizontal-v1";

  const BODY_IMAGE_SIZE = {
    width: 160,
    height: 1170,
  };

  const zones = [
    { id: "hair", label: "Spray Behind Neck and Hair", imageX: 80, imageY: 248, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -22, markerDy: -14 },
    { id: "neck", label: "Spray Shoulders", imageX: 58, imageY: 338, labelDx: 0, labelDy: 0, labelAnchor: "end", markerDx: 20, markerDy: -10 },
    { id: "shoulders", label: "Spray Chest", imageX: 77, imageY: 472, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -20, markerDy: -10 },
    { id: "chest", label: "Spray Abdomen", imageX: 77, imageY: 574, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -20, markerDy: -8 },
    { id: "solar", label: "Spray Arms/Elbows", imageX: 52, imageY: 646, labelDx: 0, labelDy: 0, labelAnchor: "end", markerDx: 20, markerDy: -6 },
    { id: "arm", label: "Spray Hips", imageX: 77, imageY: 726, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -20, markerDy: -6 },
    { id: "lower_back", label: "Spray Laps", imageX: 77, imageY: 838, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -20, markerDy: -6 },
    { id: "root", label: "Spray Behind your Knees", imageX: 73, imageY: 965, labelDx: 0, labelDy: 0, labelAnchor: "end", markerDx: 20, markerDy: -4 },
    { id: "ankles", label: "Spray Behind your Calfs", imageX: 82, imageY: 1060, labelDx: 0, labelDy: 0, labelAnchor: "start", markerDx: -20, markerDy: -4 },
  ];

  const catalog = [
      {
          "id": "bianca-perfume-amarena-e-prugna",
          "name": "AMARENA E PRUGNA",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/AMARENA-E-PRUGNA-900x1125.png"
      },
      {
          "id": "bianca-perfume-ananas-legno-papaya",
          "name": "ANANAS LEGNO PAPAYA",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/BF-Ananas-900x1125.jpg"
      },
      {
          "id": "bianca-perfume-bergamoto-amber-09",
          "name": "BERGAMOTO AMBER 09",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BERGAMOTO-AMBER-09-900x1125.png"
      },
      {
          "id": "bianca-perfume-bois-de-vanille",
          "name": "BOIS DE VANILLE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BOIS-DE-VANILLE-900x1125.png"
      },
      {
          "id": "bianca-perfume-boogie",
          "name": "BOOGIE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/WF-Boogie1.png"
      },
      {
          "id": "bianca-perfume-camelia-flowers",
          "name": "CAMELIA FLOWERS",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/CAMELIA-FLOWER-900x1125.png"
      },
      {
          "id": "bianca-perfume-candifrutt",
          "name": "CANDIFRUTT",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/CANDIFRUTT-900x1125.png"
      },
      {
          "id": "bianca-perfume-fairytale",
          "name": "FAIRYTALE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/FAIRYTALE-900x1125.png"
      },
      {
          "id": "bianca-perfume-indaco-corallo",
          "name": "INDACO CORALLO",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/BF-Indaco-Corallo-900x1125.jpg"
      },
      {
          "id": "bianca-perfume-laurel-hay",
          "name": "LAUREL HAY",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/LAUREL-HAY-900x1125.png"
      },
      {
          "id": "bianca-perfume-lemon-vanille",
          "name": "LEMON VANILLE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/LEMON-VANILLE-900x1125.png"
      },
      {
          "id": "bianca-perfume-limon-fougere",
          "name": "LIMON FOUGERE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/LIMON-FOUGERE-900x1125.png"
      },
      {
          "id": "bianca-perfume-maggie",
          "name": "MAGGIE",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MAGGIE-900x1125.png"
      },
      {
          "id": "bianca-perfume-magnolia-bella-bella",
          "name": "MAGNOLIA BELLA BELLA",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/BF-Magnolia-Bella-Bella-900x1125.jpg"
      },
      {
          "id": "bianca-perfume-maroccan-mint",
          "name": "MAROCCAN MINT",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MAROCCAN-MINT-900x1125.png"
      },
      {
          "id": "bianca-perfume-mulan-nud",
          "name": "MULAN NUD",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MULAN-NUD-900x1125.png"
      },
      {
          "id": "bianca-perfume-musk",
          "name": "MUSK",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MUSK-900x1125.png"
      },
      {
          "id": "bianca-perfume-pesca-arancia-rossa",
          "name": "PESCA ARANCIA ROSSA",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/BF-Pesca-Arancia-Rossa-900x1125.jpg"
      },
      {
          "id": "bianca-perfume-pesca-e-ambra",
          "name": "PESCA E AMBRA",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/PESCA-E-AMBRA-900x1125.png"
      },
      {
          "id": "bianca-perfume-san-salvador-thiare",
          "name": "SAN SALVADOR THIARE’",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SAN-SALVADOR-THIARE-900x1125.png"
      },
      {
          "id": "bianca-perfume-santalum-album",
          "name": "SANTALUM ALBUM",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SANTALUM-ALBUM-900x1125.png"
      },
      {
          "id": "bianca-perfume-sweet-sugar",
          "name": "SWEET SUGAR",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SWEET-SUGAR-900x1125.png"
      },
      {
          "id": "bianca-perfume-taaac",
          "name": "TAAAC",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/TAAC-900x1125.png"
      },
      {
          "id": "bianca-perfume-tender-milk",
          "name": "TENDER MILK",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/tender-milk-900x1125.png"
      },
      {
          "id": "bianca-perfume-tiglio-blu01",
          "name": "TIGLIO BLU01",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/TIGLIO-BLU01-900x1125.png"
      },
      {
          "id": "bianca-perfume-tuberosa-musk",
          "name": "TUBEROSA MUSK",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/BF-Touberosa-Musk-900x1125.jpg"
      },
      {
          "id": "bianca-perfume-vetyver-blu",
          "name": "VETYVER BLU",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/VETYVER-BLU-900x1125.png"
      },
      {
          "id": "bianca-perfume-white-pepper-oud",
          "name": "WHITE PEPPER OUD",
          "collection": "Bianca",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/WHITE-PEPPER-OUD-1-900x1125.png"
      },
      {
          "id": "amber-perfume-ambra-orientale",
          "name": "AMBRA ORIENTALE",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/AMBRA-ORIENTALE-900x1125.png"
      },
      {
          "id": "amber-perfume-ambra-viola-diris",
          "name": "AMBRA VIOLA D’IRIS",
          "collection": "Amber",
          "type": "Perfume"
      },
      {
          "id": "amber-perfume-aydan",
          "name": "AYDAN",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/AYDAN-900x1125.png"
      },
      {
          "id": "amber-perfume-bitter-zagara",
          "name": "BITTER ZAGARA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BITTER-ZAGARA-900x1125.png"
      },
      {
          "id": "amber-perfume-black-antilles",
          "name": "BLACK ANTILLES",
          "collection": "Amber",
          "type": "Perfume"
      },
      {
          "id": "amber-perfume-cananga-ylang-caffe",
          "name": "CANANGA YLANG CAFFÈ",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/CANANGA-YLANG-CAFFE-900x1125.png"
      },
      {
          "id": "amber-perfume-cedro",
          "name": "CEDRO",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/CEDRO-900x1125.png"
      },
      {
          "id": "amber-perfume-dark-chocolate-patchouli",
          "name": "DARK CHOCOLATE PATCHOULI",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/DARK-CHOCOLATE-PATCHOULI-900x1125.png"
      },
      {
          "id": "amber-perfume-davana-vinosa",
          "name": "DAVANA VINOSA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/DAVANA-VINOSA-900x1125.png"
      },
      {
          "id": "amber-perfume-dubai-sahara",
          "name": "DUBAI SAHARA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/DUBAI-SAHARA-900x1125.png"
      },
      {
          "id": "amber-perfume-fava-tonka",
          "name": "FAVA TONKA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/AF-Fava-Tonka1-900x1125.jpg"
      },
      {
          "id": "amber-perfume-freak",
          "name": "FREAK",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/FREAK-900x1125.png"
      },
      {
          "id": "amber-perfume-gesolmino-marino",
          "name": "GESOLMINO MARINO",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/AF-Gesolmino-Marino-900x1125.jpg"
      },
      {
          "id": "amber-perfume-hott-tabaco",
          "name": "HOTT TABACO",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/HOTT-TABACO-900x1125.png"
      },
      {
          "id": "amber-perfume-incenso-caldo",
          "name": "INCENSO CALDO",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/AF-Incenso-Caldo-900x1125.jpg"
      },
      {
          "id": "amber-perfume-labdanum-gold",
          "name": "LABDANUM GOLD",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/LABDANUM-GOLD-900x1125.png"
      },
      {
          "id": "amber-perfume-milla-300",
          "name": "MILLA 300",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MILLA-300-900x1125.png"
      },
      {
          "id": "amber-perfume-passiflora-rouge",
          "name": "PASSIFLORA ROUGE",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/PASSIFLORA-ROUGE-900x1125.png"
      },
      {
          "id": "amber-perfume-payago",
          "name": "PAYAGO",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/PAYAGO-900x1125.png"
      },
      {
          "id": "amber-perfume-poudre-iris",
          "name": "POUDRE IRIS",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/POUDRE-IRIS-900x1125.png"
      },
      {
          "id": "amber-perfume-santalum-red",
          "name": "SANTALUM RED",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SANTALUM-RED-900x1125.png"
      },
      {
          "id": "amber-perfume-spicy-clove",
          "name": "SPICY CLOVE",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SPICY-CLOVE-900x1125.png"
      },
      {
          "id": "amber-perfume-sugar-jasmine",
          "name": "SUGAR JASMINE",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SUGAR-JASMINE-900x1125.png"
      },
      {
          "id": "amber-perfume-te-mi-de",
          "name": "TE MI DE",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/TE-MI-DE-900x1125.png"
      },
      {
          "id": "amber-perfume-tobacco-flowers",
          "name": "TOBACCO FLOWERS",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/TOBACCO-FLOWERS-900x1125.png"
      },
      {
          "id": "amber-perfume-tolu",
          "name": "TOLU",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/AF-Tolu-900x1125.jpg"
      },
      {
          "id": "amber-perfume-tuberosa-bianca",
          "name": "TUBEROSA BIANCA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/AF-Touberosa-Bianca-900x1125.jpg"
      },
      {
          "id": "amber-perfume-vaniglia01",
          "name": "VANIGLIA01",
          "collection": "Amber",
          "type": "Perfume"
      },
      {
          "id": "amber-perfume-zafferano-tonka",
          "name": "ZAFFERANO TONKA",
          "collection": "Amber",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/ZAFFERANO-TONKA-900x1125.png"
      },
      {
          "id": "raw-perfume-absolute-40",
          "name": "ABSOLUTE 40%",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/RF-Absolute-40-900x1125.jpg"
      },
      {
          "id": "raw-perfume-alchemical-spice",
          "name": "ALCHEMICAL SPICE",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/ALCHEMICAL-SPICE-900x1125.png"
      },
      {
          "id": "raw-perfume-amyas-marrakesh",
          "name": "AMYAS MARRAKESH",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/AMYAS-MARRAKECH-900x1125.png"
      },
      {
          "id": "raw-perfume-arabian-nektar",
          "name": "ARABIAN NEKTAR",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/ARABIAN-NEKTAR-900x1125.png"
      },
      {
          "id": "raw-perfume-argilla-guatemala",
          "name": "ARGILLA GUATEMALA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/RF-ARGILLA-GUATEMALA-900x1125.jpg"
      },
      {
          "id": "raw-perfume-black-regressive",
          "name": "BLACK REGRESSIVE",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BLACK-REGRESSIVE-1-900x1125.png"
      },
      {
          "id": "raw-perfume-blackened-oud",
          "name": "BLACKENED OUD",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BLACKENED-OUD-900x1125.png"
      },
      {
          "id": "raw-perfume-cioccolato",
          "name": "CIOCCOLATO",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/FAIRYTALE-1-900x1125.png"
      },
      {
          "id": "raw-perfume-frangipani-bloom",
          "name": "FRANGIPANI BLOOM",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/FRANGIPANI-BLOOM-1-900x1125.png"
      },
      {
          "id": "raw-perfume-gemme-di-ciliegia",
          "name": "GEMME DI CILIEGIA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/FRANGIPANI-BLOOM-900x1125.png"
      },
      {
          "id": "raw-perfume-ginger-artemisia",
          "name": "GINGER ARTEMISIA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/GINGER-ARTEMISIA-900x1125.png"
      },
      {
          "id": "raw-perfume-indonesia",
          "name": "INDONESIA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/INDONESIA-900x1125.png"
      },
      {
          "id": "raw-perfume-jasmine-cliche",
          "name": "JASMINE CLICHE’",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/JASMINE-CLICHE-900x1125.png"
      },
      {
          "id": "raw-perfume-latte-noce-moscata",
          "name": "LATTE NOCE MOSCATA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/06/RF-Latte-Noce-Moscata-900x1125.jpg"
      },
      {
          "id": "raw-perfume-mooi-cologne",
          "name": "MOOI COLOGNE",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/MOOI-COLOGNE-900x1125.png"
      },
      {
          "id": "raw-perfume-peluscioso",
          "name": "PELUSCIOSO",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/PELUSCIOSO-900x1125.png"
      },
      {
          "id": "raw-perfume-radica-aoud",
          "name": "RADICA AOUD",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/RADICA-OUD-900x1125.png"
      },
      {
          "id": "raw-perfume-red-cigars",
          "name": "RED CIGARS",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/RED-CIGARS-900x1125.png"
      },
      {
          "id": "raw-perfume-resina-quercia",
          "name": "RESINA QUERCIA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/RESINA-QUERCIA-900x1125.png"
      },
      {
          "id": "raw-perfume-sex-therapy",
          "name": "SEX THERAPY",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SEX-THERAPY-900x1125.png"
      },
      {
          "id": "raw-perfume-spezie-winter",
          "name": "SPEZIE WINTER",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SPEZIE-WINTER-900x1125.png"
      },
      {
          "id": "raw-perfume-spin-rose",
          "name": "SPIN-ROSE",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/SPIN-ROSE-900x1125.png"
      },
      {
          "id": "raw-perfume-touberosa",
          "name": "TOUBEROSA",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/TOUBEROSA-900x1125.png"
      },
      {
          "id": "raw-perfume-vaniglia-07",
          "name": "VANIGLIA 07",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/VANIGLIA-07-900x1125.png"
      },
      {
          "id": "raw-perfume-white-powder",
          "name": "WHITE POWDER",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/WHITE-POWDER-2-1-900x1125.png"
      },
      {
          "id": "raw-perfume-wild-fennel",
          "name": "WILD FENNEL",
          "collection": "Raw",
          "type": "Perfume",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/WILD-FENNEL-1-900x1125.png"
      },
      {
          "id": "skin-body-cream-amarena-e-prugna",
          "name": "AMARENA E PRUGNA",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-AMARENA-E-PRUGNA-900x1125.png"
      },
      {
          "id": "skin-body-cream-arabian-nektar",
          "name": "ARABIAN NEKTAR",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-ARABIAN-NEKTAR-900x1125.png"
      },
      {
          "id": "skin-body-lotion-aydan",
          "name": "AYDAN",
          "collection": "Skin",
          "type": "Body Lotion",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-LOTION-AYDAN-900x1125.png"
      },
      {
          "id": "skin-body-cream-bergamotto-amber09",
          "name": "BERGAMOTTO AMBER09",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-BERGAMOTTO-AMBER09-900x1125.png"
      },
      {
          "id": "skin-body-cream-blackened-oud",
          "name": "BLACKENED OUD",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-BLACKENED-OUD-900x1125.png"
      },
      {
          "id": "skin-body-cream-camelia-flowers",
          "name": "CAMELIA FLOWERS",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-CAMELIA-FLOWERS-900x1125.png"
      },
      {
          "id": "skin-body-cream-dark-chocolate-patchouly",
          "name": "DARK CHOCOLATE PATCHOULY",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-DUBAI-SAHARA-900x1125.png"
      },
      {
          "id": "skin-body-cream-dubai-sahara",
          "name": "DUBAI SAHARA",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-DUBAI-SAHARA-1-900x1125.png"
      },
      {
          "id": "skin-body-cream-frangipani-bloom",
          "name": "FRANGIPANI BLOOM",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-FRANGIPANI-BLOOM-900x1125.png"
      },
      {
          "id": "skin-body-cream-indonesia",
          "name": "INDONESIA",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-INDONESIA-900x1125.png"
      },
      {
          "id": "skin-body-care-labdanum-gold",
          "name": "LABDANUM GOLD",
          "collection": "Skin",
          "type": "Body Care",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/12/Screenshot-2025-12-09-at-12.48.31-900x890.png"
      },
      {
          "id": "skin-body-cream-lemon-vanille",
          "name": "LEMON VANILLE",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-LEMON-VANILLE-900x1125.png"
      },
      {
          "id": "skin-body-lotion-maroccan-mint",
          "name": "MAROCCAN MINT",
          "collection": "Skin",
          "type": "Body Lotion",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-LOTION-MAROCCAN-MINT-900x1125.png"
      },
      {
          "id": "skin-body-lotion-mooi-cologne",
          "name": "MOOI COLOGNE",
          "collection": "Skin",
          "type": "Body Lotion",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-LOTION-MOOI-COLOGNE-900x1125.png"
      },
      {
          "id": "skin-body-cream-mulan-nud",
          "name": "MULAN NUD",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-MULAN-NUD-900x1125.png"
      },
      {
          "id": "skin-body-lotion-payago",
          "name": "PAYAGO",
          "collection": "Skin",
          "type": "Body Lotion",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-LOTION-PAYAGO-900x1125.png"
      },
      {
          "id": "skin-body-cream-red-cigars",
          "name": "RED CIGARS",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-RED-CIGARS-900x1125.png"
      },
      {
          "id": "skin-body-cream-san-salvador-thiare",
          "name": "SAN SALVADOR THIARE",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-SAN-SALVADOR-THIARE-900x1125.png"
      },
      {
          "id": "skin-body-cream-spin-rose",
          "name": "SPIN-ROSE",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-TENDER-MILK-900x1125.png"
      },
      {
          "id": "skin-body-cream-tender-milk",
          "name": "TENDER MILK",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-TENDER-MILK-900x1125.png"
      },
      {
          "id": "skin-body-cream-touberosa",
          "name": "TOUBEROSA",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-TOUBEROSA-900x1125.png"
      },
      {
          "id": "skin-body-cream-vaniglia07",
          "name": "VANIGLIA07",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-TOUBEROSA-1-900x1125.png"
      },
      {
          "id": "skin-body-lotion-vetyver-blu",
          "name": "VETYVER BLU",
          "collection": "Skin",
          "type": "Body Lotion",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-LOTION-VETYVER-BLU-900x1125.png"
      },
      {
          "id": "skin-body-cream-white-powder",
          "name": "WHITE POWDER",
          "collection": "Skin",
          "type": "Body Cream",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/BODY-CREAM-WHITE-POWDER-900x1125.png"
      },
      {
          "id": "skin-oil-amarena-e-prugna",
          "name": "AMARENA E PRUGNA",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-AMARENA-E-PRUGNA-900x1125.png"
      },
      {
          "id": "skin-oil-aydan",
          "name": "AYDAN",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-AYDAN-900x1125.png"
      },
      {
          "id": "skin-oil-bergamotto-amber09",
          "name": "BERGAMOTTO AMBER09",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-BERGAMOTTO-AMBER09-900x1125.png"
      },
      {
          "id": "skin-oil-boogie",
          "name": "BOOGIE",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-BOOGIE-900x1125.png"
      },
      {
          "id": "skin-oil-dubai-sahara",
          "name": "DUBAI SAHARA",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-DUBAI-SAHARA-900x1125.png"
      },
      {
          "id": "skin-oil-hott-tabaco",
          "name": "HOTT TABACO",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-HOTT-TABACO-900x1125.png"
      },
      {
          "id": "skin-oil-jasmine-cliche",
          "name": "JASMINE CLICHE’",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-JASMINE-CLICHE-900x1125.png"
      },
      {
          "id": "skin-oil-mulan-nud",
          "name": "MULAN NUD",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-IL-CORPO-MULAN-NUD-900x1125.png"
      },
      {
          "id": "skin-oil-passiflora-rouge",
          "name": "PASSIFLORA ROUGE",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-PASSIFLORA-ROUGE-900x1125.png"
      },
      {
          "id": "skin-oil-payago",
          "name": "PAYAGO",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-PAYAGO-900x1125.png"
      },
      {
          "id": "skin-oil-sugar-jasmine",
          "name": "SUGAR JASMINE",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-SUGAR-JASMINE-900x1125.png"
      },
      {
          "id": "skin-oil-sweet-sugar",
          "name": "SWEET SUGAR",
          "collection": "Skin",
          "type": "Oil",
          "image": "https://tortimassimiliano.com/wp-content/uploads/2025/01/OLIO-PER-PROFUMO-SWEET-SUGAR-900x1125.png"
      }
  ];

  const state = {
    firstName: "",
    lastName: "",
    search: "",
    customerLibrary: [],
    layers: [],
    activeLayerId: null,
    bottles: [],
    zoneLabelOffsets: {},
    isAdjustingLabels: false,
    selectedBottleId: null,
    pendingCatalogId: null,
    savedSheets: [],
    currentSheetId: null,
  };

  let bottleSeed = 0;
  let dragCatalogId = null;
  let activeBottleDrag = null;
  let activeLabelDrag = null;
  let suppressBottleClickId = null;

  const exportRoot = document.querySelector("[data-export-root]");
  const sheetDocument = document.querySelector(".sheet-document");
  const firstNameInput = document.querySelector("[data-first-name]");
  const lastNameInput = document.querySelector("[data-last-name]");
  const documentStage = document.querySelector("[data-document-stage]");
  const bodyMap = document.querySelector("[data-body-map]");
  const bodySketch = document.querySelector(".body-sketch");
  const bottleLayer = document.querySelector("[data-bottle-layer]");
  const zoneLayer = document.querySelector("[data-zone-layer]");
  const productScroller = document.querySelector("[data-product-scroller]");
  const searchInput = document.querySelector("[data-product-search]");
  const sheetStatus = document.querySelector("[data-sheet-status]");
  const adjustLabelsButton = document.querySelector("[data-adjust-labels]");
  const removeSelectedButton = document.querySelector("[data-remove-selected]");
  const selectedBottlePanel = document.querySelector("[data-selected-bottle-panel]");
  const saveSheetButton = document.querySelector("[data-save-sheet]");
  const newSheetButton = document.querySelector("[data-new-sheet]");
  const downloadSavedButton = document.querySelector("[data-download-saved]");
  const savedSheetsPanel = document.querySelector("[data-saved-sheets-panel]");
  const layersPanel = document.querySelector("[data-layers-panel]");
  const customerLibraryPanel = document.querySelector("[data-customer-library]");
  const pdfButtons = Array.from(document.querySelectorAll("[data-pdf-trigger]"));
  const levelRows = Array.from(document.querySelectorAll("[data-level-row]"));
  const placementTargets = Array.from(document.querySelectorAll("[data-place-level]"));
  const stageDefaults = {
    high: {
      Perfume: { x: 24, y: 18 },
      Oil: { x: 68, y: 16 },
      "Body Lotion": { x: 69, y: 24 },
    },
    middle: {
      Perfume: { x: 25, y: 47 },
      Oil: { x: 68, y: 45 },
      "Body Lotion": { x: 69, y: 54 },
    },
    low: {
      Perfume: { x: 25, y: 78 },
      Oil: { x: 67, y: 75 },
      "Body Lotion": { x: 69, y: 84 },
    },
  };
  const freePositionLimits = {
    minX: 8,
    maxX: 92,
    minY: 8,
    maxY: 92,
  };

  function detachLabelDragListeners() {
    document.removeEventListener("pointermove", handleLabelDragMove, true);
    document.removeEventListener("pointerup", handleLabelDragEnd, true);
    document.removeEventListener("pointercancel", handleLabelDragCancel, true);
  }

  function updateDraggedLabelPosition() {
    if (!activeLabelDrag || !activeLabelDrag.cluster) {
      return;
    }

    activeLabelDrag.cluster.style.setProperty("--zone-offset-x", `${activeLabelDrag.currentX}px`);
    activeLabelDrag.cluster.style.setProperty("--zone-offset-y", `${activeLabelDrag.currentY}px`);
    if (activeLabelDrag.hit) {
      activeLabelDrag.hit.style.setProperty("--zone-offset-x", `${activeLabelDrag.currentX}px`);
      activeLabelDrag.hit.style.setProperty("--zone-offset-y", `${activeLabelDrag.currentY}px`);
    }
  }

  function handleLabelDragMove(event) {
    if (!activeLabelDrag || activeLabelDrag.pointerId !== event.pointerId) {
      return;
    }

    const nextX = Math.round(activeLabelDrag.startX + (event.clientX - activeLabelDrag.startClientX));
    const nextY = Math.round(activeLabelDrag.startY + (event.clientY - activeLabelDrag.startClientY));
    const movedDistance = Math.hypot(
      event.clientX - activeLabelDrag.startClientX,
      event.clientY - activeLabelDrag.startClientY
    );

    if (movedDistance > 3) {
      activeLabelDrag.moved = true;
    }

    activeLabelDrag.currentX = nextX;
    activeLabelDrag.currentY = nextY;
    state.zoneLabelOffsets[activeLabelDrag.zoneId] = { x: nextX, y: nextY };
    updateDraggedLabelPosition();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleLabelDragEnd(event) {
    if (!activeLabelDrag || activeLabelDrag.pointerId !== event.pointerId) {
      return;
    }

    const zoneId = activeLabelDrag.zoneId;
    const moved = activeLabelDrag.moved;
    const dragHandle = activeLabelDrag.dragHandle;

    if (dragHandle && dragHandle.releasePointerCapture) {
      try {
        dragHandle.releasePointerCapture(event.pointerId);
      } catch (error) {
        // no-op
      }
    }

    if (activeLabelDrag.cluster) {
      activeLabelDrag.cluster.classList.remove("is-dragging");
    }

    activeLabelDrag = null;
    detachLabelDragListeners();

    if (!moved) {
      toggleZone(zoneId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    renderZoneLayer();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleLabelDragCancel(event) {
    if (!activeLabelDrag || activeLabelDrag.pointerId !== event.pointerId) {
      return;
    }

    if (activeLabelDrag.cluster) {
      activeLabelDrag.cluster.classList.remove("is-dragging");
    }

    activeLabelDrag = null;
    detachLabelDragListeners();
    renderZoneLayer();
    event.preventDefault();
    event.stopPropagation();
  }

  function syncSheetPaperLock() {
    if (!sheetDocument) {
      return;
    }

    const shouldLock = sheetDocument.scrollWidth <= sheetDocument.clientWidth + 1;
    sheetDocument.classList.toggle("is-paper-locked", shouldLock);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
  }

  function clamp(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, value));
  }

  function getLevelFromY(yValue) {
    if (yValue < 33.333) {
      return "high";
    }

    if (yValue < 66.666) {
      return "middle";
    }

    return "low";
  }

  function getStageCoordsFromClient(clientX, clientY) {
    if (!documentStage) {
      return null;
    }

    const rect = documentStage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;
    const x = clamp(rawX, freePositionLimits.minX, freePositionLimits.maxX);
    const y = clamp(rawY, freePositionLimits.minY, freePositionLimits.maxY);

    return {
      x: x,
      y: y,
      level: getLevelFromY(y),
    };
  }

  function getDefaultBottlePosition(level, type, offsetIndex) {
    const placementType = getPlacementType(type);
    const defaults = (stageDefaults[level] && stageDefaults[level][placementType]) || { x: 50, y: 50 };
    const xOffsets = placementType === "Perfume" ? [-6, 0, 6, -10, 10] : [-4, 4, -8, 8, 0];
    const yOffsets = [0, 4, -4, 8, -8];
    const offset = Number.isFinite(offsetIndex) ? offsetIndex : 0;

    return {
      x: clamp(defaults.x + xOffsets[offset % xOffsets.length], freePositionLimits.minX, freePositionLimits.maxX),
      y: clamp(defaults.y + yOffsets[offset % yOffsets.length], freePositionLimits.minY, freePositionLimits.maxY),
      level: level,
    };
  }

  function getPlacementType(type) {
    return ["Body Lotion", "Body Cream", "Body Care"].includes(type) ? "Body Lotion" : type;
  }

  function getCatalogItem(catalogId) {
    return catalog.find((item) => item.id === catalogId);
  }

  function getBottle(bottleId) {
    return state.bottles.find((item) => item.id === bottleId);
  }

  function getSelectedBottle() {
    return getBottle(state.selectedBottleId);
  }

  function getZone(zoneId) {
    return zones.find((zone) => zone.id === zoneId);
  }

  function getZoneMapPosition(zone) {
    if (!zone || !bodyMap) {
      return { x: "50%", y: "50%" };
    }

    return {
      x: `${clamp((zone.imageX / BODY_IMAGE_SIZE.width) * 100, 0, 100)}%`,
      y: `${clamp((zone.imageY / BODY_IMAGE_SIZE.height) * 100, 0, 100)}%`,
    };
  }

  function getBottleZoneNames(bottle) {
    if (!bottle) {
      return [];
    }

    return bottle.zones
      .map((zoneId) => {
        const zone = getZone(zoneId);
        return zone ? zone.label : "";
      })
      .filter(Boolean);
  }

  function getCompactZoneLabel(label) {
    return String(label || "").replace(/^Spray\s+/i, "").trim();
  }

  function renderBottleZoneSummary(zoneNames, isSelected) {
    if (!zoneNames.length && !isSelected) {
      return "";
    }

    if (!zoneNames.length) {
      return `<span class="sheet-bottle-zones-summary is-empty">Select spray areas</span>`;
    }

    const compactNames = zoneNames.map(getCompactZoneLabel).filter(Boolean);
    const visibleNames = compactNames.slice(0, 3);
    const remainingCount = compactNames.length - visibleNames.length;

    return `
      <span class="sheet-bottle-zones-summary">
        <span class="sheet-bottle-zones-label">Spray areas</span>
        <span class="sheet-bottle-zones-list">
          ${visibleNames.map((name) => `<span class="sheet-bottle-zone-item">${escapeHtml(name)}</span>`).join("")}
          ${remainingCount > 0 ? `<span class="sheet-bottle-zone-more">+${remainingCount} more</span>` : ""}
        </span>
      </span>
    `;
  }

  function normalizeBottlePosition(bottle, offsetIndex) {
    const product = getCatalogItem(bottle.catalogId);
    const fallback = getDefaultBottlePosition(bottle.level || "middle", product ? product.type : "Perfume", offsetIndex);
    const x = Number.isFinite(Number(bottle.x)) ? Number(bottle.x) : fallback.x;
    const y = Number.isFinite(Number(bottle.y)) ? Number(bottle.y) : fallback.y;

    return {
      x: clamp(x, freePositionLimits.minX, freePositionLimits.maxX),
      y: clamp(y, freePositionLimits.minY, freePositionLimits.maxY),
      level: getLevelFromY(Number.isFinite(Number(bottle.y)) ? Number(bottle.y) : fallback.y),
    };
  }

  function cloneBottles(bottles) {
    return (bottles || []).map((bottle, index) => {
      const position = normalizeBottlePosition(bottle, index);

      return {
        id: bottle.id,
        catalogId: bottle.catalogId,
        level: position.level,
        x: position.x,
        y: position.y,
        zones: Array.isArray(bottle.zones) ? bottle.zones.slice() : [],
      };
    });
  }

  function cloneZoneLabelOffsets(offsets) {
    const source = offsets && typeof offsets === "object" ? offsets : {};
    return zones.reduce((accumulator, zone) => {
      const value = source[zone.id];
      const x = Number(value && value.x);
      const y = Number(value && value.y);
      accumulator[zone.id] = {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
      };
      return accumulator;
    }, {});
  }

  function createLayerRecord(name, bottles, zoneLabelOffsets) {
    return {
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || "Layer"),
      bottles: cloneBottles(bottles),
      zoneLabelOffsets: cloneZoneLabelOffsets(zoneLabelOffsets),
    };
  }

  function cloneLayers(layers) {
    return (Array.isArray(layers) ? layers : [])
      .filter((layer) => layer && typeof layer === "object")
      .map((layer, index) => ({
        id: String(layer.id || `layer-${index + 1}`),
        name: String(layer.name || `Layer ${index + 1}`),
        bottles: cloneBottles(layer.bottles),
        zoneLabelOffsets: cloneZoneLabelOffsets(layer.zoneLabelOffsets),
      }));
  }

  function buildDefaultLayers(initialBottles, initialZoneLabelOffsets) {
    return Array.from({ length: 4 }, function (_, index) {
      return createLayerRecord(
        `Layer ${index + 1}`,
        index === 0 ? initialBottles : [],
        index === 0 ? initialZoneLabelOffsets : {}
      );
    });
  }

  function ensureMinimumLayers(layers, fallbackBottles, fallbackZoneLabelOffsets) {
    const nextLayers = cloneLayers(layers);

    if (nextLayers.length === 0) {
      return buildDefaultLayers(fallbackBottles, fallbackZoneLabelOffsets);
    }

    return nextLayers;
  }

  function normalizeCustomerLibrary(customerLibrary, layers) {
    const seen = new Set();
    const ordered = [];

    const append = function (catalogId) {
      if (!catalogId || seen.has(catalogId) || !getCatalogItem(catalogId)) {
        return;
      }

      seen.add(catalogId);
      ordered.push(catalogId);
    };

    (Array.isArray(customerLibrary) ? customerLibrary : []).forEach(append);
    (Array.isArray(layers) ? layers : []).forEach((layer) => {
      (Array.isArray(layer.bottles) ? layer.bottles : []).forEach((bottle) => {
        append(bottle.catalogId);
      });
    });

    return ordered;
  }

  function resolveSnapshotLayers(snapshot) {
    const legacyOffsets = getSnapshotZoneLabelOffsets(snapshot);
    const hasLayers = snapshot && Array.isArray(snapshot.layers) && snapshot.layers.length > 0;
    const sourceLayers = hasLayers
      ? cloneLayers(snapshot.layers)
      : buildDefaultLayers(snapshot && snapshot.bottles, legacyOffsets);

    return ensureMinimumLayers(sourceLayers, snapshot && snapshot.bottles, legacyOffsets);
  }

  function getActiveLayer() {
    if (!state.layers.length) {
      state.layers = buildDefaultLayers();
      state.activeLayerId = state.layers[0].id;
    }

    const layer = state.layers.find((entry) => entry.id === state.activeLayerId) || state.layers[0] || null;

    if (layer && state.activeLayerId !== layer.id) {
      state.activeLayerId = layer.id;
    }

    return layer;
  }

  function syncActiveLayerSnapshot() {
    const activeLayer = getActiveLayer();
    if (!activeLayer) {
      return;
    }

    activeLayer.bottles = cloneBottles(state.bottles);
    activeLayer.zoneLabelOffsets = cloneZoneLabelOffsets(state.zoneLabelOffsets);
    state.customerLibrary = normalizeCustomerLibrary(state.customerLibrary, state.layers);
  }

  function addCatalogToLibrary(catalogId) {
    if (!catalogId || !getCatalogItem(catalogId)) {
      return;
    }

    state.customerLibrary = normalizeCustomerLibrary(state.customerLibrary.concat(catalogId), state.layers);
  }

  function getSnapshotZoneLabelOffsets(snapshot) {
    const version = snapshot && typeof snapshot === "object" ? snapshot.zoneLayoutVersion : "";
    if (version !== ZONE_LAYOUT_VERSION) {
      return cloneZoneLabelOffsets({});
    }

    return cloneZoneLabelOffsets(snapshot.zoneLabelOffsets);
  }

  function getZoneLabelOffset(zoneId) {
    const value = state.zoneLabelOffsets[zoneId];
    if (!value) {
      return { x: 0, y: 0 };
    }

    return {
      x: Number.isFinite(Number(value.x)) ? Number(value.x) : 0,
      y: Number.isFinite(Number(value.y)) ? Number(value.y) : 0,
    };
  }

  function syncBottleSeed() {
    bottleSeed = state.bottles.reduce((maxValue, bottle) => {
      const match = String(bottle.id || "").match(/(\d+)$/);
      const numeric = match ? Number(match[1]) : 0;
      return Math.max(maxValue, Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }

  function syncFormFields() {
    firstNameInput.value = state.firstName;
    lastNameInput.value = state.lastName;
    searchInput.value = state.search;
  }

  function getWorkingStateSnapshot() {
    syncActiveLayerSnapshot();

    return {
      firstName: state.firstName,
      lastName: state.lastName,
      search: state.search,
      customerLibrary: state.customerLibrary.slice(),
      layers: cloneLayers(state.layers),
      activeLayerId: state.activeLayerId,
      bottles: cloneBottles(state.bottles),
      zoneLabelOffsets: cloneZoneLabelOffsets(state.zoneLabelOffsets),
      zoneLayoutVersion: ZONE_LAYOUT_VERSION,
      isAdjustingLabels: state.isAdjustingLabels,
      selectedBottleId: state.selectedBottleId,
      pendingCatalogId: state.pendingCatalogId,
      currentSheetId: state.currentSheetId,
    };
  }

  function applyWorkingState(snapshot) {
    snapshot = snapshot || {};
    const nextLayers = resolveSnapshotLayers(snapshot || {});
    const nextActiveLayerId = snapshot && nextLayers.some((layer) => layer.id === snapshot.activeLayerId)
      ? snapshot.activeLayerId
      : (nextLayers[0] ? nextLayers[0].id : null);
    const activeLayer = nextLayers.find((layer) => layer.id === nextActiveLayerId) || nextLayers[0] || createLayerRecord("Layer 1", [], {});

    state.firstName = snapshot.firstName || "";
    state.lastName = snapshot.lastName || "";
    state.search = snapshot.search || "";
    state.customerLibrary = normalizeCustomerLibrary(snapshot.customerLibrary, nextLayers);
    state.layers = nextLayers;
    state.activeLayerId = activeLayer.id;
    state.bottles = cloneBottles(activeLayer.bottles);
    state.zoneLabelOffsets = cloneZoneLabelOffsets(activeLayer.zoneLabelOffsets);
    state.isAdjustingLabels = Boolean(snapshot.isAdjustingLabels);
    state.selectedBottleId = snapshot.selectedBottleId || null;
    state.pendingCatalogId = snapshot.pendingCatalogId || null;
    state.currentSheetId = snapshot.currentSheetId || null;
    syncBottleSeed();
    syncFormFields();
  }

  function buildSheetSnapshot(sheetId) {
    syncActiveLayerSnapshot();

    const existingSheet = state.currentSheetId
      ? state.savedSheets.find((sheet) => sheet.id === state.currentSheetId)
      : null;
    const now = new Date().toISOString();

    return {
      id: sheetId || state.currentSheetId || `sheet-${Date.now()}`,
      firstName: state.firstName.trim(),
      lastName: state.lastName.trim(),
      customerLibrary: state.customerLibrary.slice(),
      layers: cloneLayers(state.layers),
      activeLayerId: state.activeLayerId,
      bottles: cloneBottles(state.bottles),
      zoneLabelOffsets: cloneZoneLabelOffsets(state.zoneLabelOffsets),
      zoneLayoutVersion: ZONE_LAYOUT_VERSION,
      createdAt: existingSheet ? existingSheet.createdAt : now,
      updatedAt: now,
    };
  }

  function getSheetLabel(sheet, index) {
    const name = [sheet.firstName, sheet.lastName].filter(Boolean).join(" ").trim();
    if (name) {
      return name;
    }

    return `Sheet ${String(index + 1).padStart(2, "0")}`;
  }

  function persistSavedSheets() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.savedSheets));
    } catch (error) {
      console.warn("Could not persist saved Torti sheets", error);
    }
  }

  function loadSavedSheets() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((sheet) => sheet && typeof sheet === "object")
        .map((sheet) => {
          const nextLayers = resolveSnapshotLayers(sheet);
          const activeLayerId = nextLayers.some((layer) => layer.id === sheet.activeLayerId)
            ? sheet.activeLayerId
            : nextLayers[0].id;
          const activeLayer = nextLayers.find((layer) => layer.id === activeLayerId) || nextLayers[0];

          return {
            id: String(sheet.id || `sheet-${Date.now()}`),
            firstName: String(sheet.firstName || ""),
            lastName: String(sheet.lastName || ""),
            customerLibrary: normalizeCustomerLibrary(sheet.customerLibrary, nextLayers),
            layers: nextLayers,
            activeLayerId: activeLayerId,
            bottles: cloneBottles(activeLayer.bottles),
            zoneLabelOffsets: cloneZoneLabelOffsets(activeLayer.zoneLabelOffsets),
            zoneLayoutVersion: sheet.zoneLayoutVersion || "",
            createdAt: sheet.createdAt || new Date().toISOString(),
            updatedAt: sheet.updatedAt || sheet.createdAt || new Date().toISOString(),
          };
        });
    } catch (error) {
      console.warn("Could not load saved Torti sheets", error);
      return [];
    }
  }

  function saveCurrentSheet() {
    const snapshot = buildSheetSnapshot();
    const existingIndex = state.savedSheets.findIndex((sheet) => sheet.id === snapshot.id);

    if (existingIndex >= 0) {
      state.savedSheets.splice(existingIndex, 1, snapshot);
    } else {
      state.savedSheets = [snapshot].concat(state.savedSheets);
    }

    state.currentSheetId = snapshot.id;
    persistSavedSheets();
    render();
  }

  function loadSavedSheet(sheetId) {
    const snapshot = state.savedSheets.find((sheet) => sheet.id === sheetId);
    if (!snapshot) {
      return;
    }

    applyWorkingState({
      firstName: snapshot.firstName,
      lastName: snapshot.lastName,
      search: "",
      customerLibrary: snapshot.customerLibrary,
      layers: snapshot.layers,
      activeLayerId: snapshot.activeLayerId,
      bottles: snapshot.bottles,
      zoneLabelOffsets: snapshot.zoneLabelOffsets,
      isAdjustingLabels: false,
      selectedBottleId: null,
      pendingCatalogId: null,
      currentSheetId: snapshot.id,
    });
    render();
  }

  function createNewSheet() {
    applyWorkingState({
      firstName: "",
      lastName: "",
      search: "",
      customerLibrary: [],
      layers: buildDefaultLayers(),
      activeLayerId: null,
      bottles: [],
      zoneLabelOffsets: {},
      isAdjustingLabels: false,
      selectedBottleId: null,
      pendingCatalogId: null,
      currentSheetId: null,
    });
    render();
  }

  function createBottle(catalogId, level, position) {
    const product = getCatalogItem(catalogId);
    if (!product) {
      return null;
    }

    addCatalogToLibrary(catalogId);

    bottleSeed += 1;
    const placementType = getPlacementType(product.type);
    const offsetIndex = state.bottles.filter((item) => {
      const itemProduct = getCatalogItem(item.catalogId);
      return item.level === level && itemProduct && getPlacementType(itemProduct.type) === placementType;
    }).length;
    const bottlePosition = position || getDefaultBottlePosition(level, product.type, offsetIndex);

    return {
      id: `bottle-${bottleSeed}`,
      catalogId: catalogId,
      level: bottlePosition.level,
      x: bottlePosition.x,
      y: bottlePosition.y,
      zones: [],
    };
  }

  function renderBottleVisual(product, baseClass) {
    const collectionClass = `collection-${slugify(product.collection)}`;
    const typeClass = `type-${slugify(product.type)}`;
    const hasImage = Boolean(product.image);

    return `
      <span class="${escapeHtml(baseClass)} ${escapeHtml(collectionClass)} ${escapeHtml(typeClass)}${hasImage ? " has-image" : ""}" aria-hidden="true">
        ${
          hasImage
            ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async" />`
            : ""
        }
        <span class="bottle-collection-mark"></span>
      </span>
    `;
  }

  function renderProductMeta(product, baseClass) {
    const collectionClass = `collection-${slugify(product.collection)}`;

    return `
      <span class="${escapeHtml(baseClass)}">
        <span class="collection-mark ${escapeHtml(collectionClass)}" aria-hidden="true"></span>
        <span>${escapeHtml(product.type)}</span>
      </span>
    `;
  }

  function setPendingCatalog(catalogId) {
    state.pendingCatalogId = state.pendingCatalogId === catalogId ? null : catalogId;
    state.selectedBottleId = null;
    render();
  }

  function activateLayer(layerId) {
    syncActiveLayerSnapshot();
    const nextLayer = state.layers.find((layer) => layer.id === layerId);
    if (!nextLayer) {
      return;
    }

    state.activeLayerId = nextLayer.id;
    state.bottles = cloneBottles(nextLayer.bottles);
    state.zoneLabelOffsets = cloneZoneLabelOffsets(nextLayer.zoneLabelOffsets);
    state.selectedBottleId = null;
    state.pendingCatalogId = null;
    syncBottleSeed();
    render();
  }

  function createLayer() {
    syncActiveLayerSnapshot();
    const nextLayer = createLayerRecord(`Layer ${state.layers.length + 1}`, [], {});

    state.layers = state.layers.concat(nextLayer);
    state.activeLayerId = nextLayer.id;
    state.bottles = [];
    state.zoneLabelOffsets = cloneZoneLabelOffsets({});
    state.selectedBottleId = null;
    state.pendingCatalogId = null;
    syncBottleSeed();
    render();
  }

  function renameLayer(layerId) {
    syncActiveLayerSnapshot();
    const layer = state.layers.find((entry) => entry.id === layerId);
    if (!layer) {
      return;
    }

    const nextName = window.prompt("Rename layer", layer.name);
    if (nextName === null) {
      return;
    }

    const trimmed = nextName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      return;
    }

    layer.name = trimmed.slice(0, 48);
    render();
  }

  function deleteLayer(layerId) {
    syncActiveLayerSnapshot();

    if (state.layers.length <= 1) {
      window.alert("At least one layer must remain.");
      return;
    }

    const layerIndex = state.layers.findIndex((entry) => entry.id === layerId);
    if (layerIndex < 0) {
      return;
    }

    const layer = state.layers[layerIndex];
    const bottleCount = Array.isArray(layer.bottles) ? layer.bottles.length : 0;
    const confirmed = window.confirm(
      bottleCount > 0
        ? `Delete ${layer.name}? This will remove ${bottleCount} bottle${bottleCount === 1 ? "" : "s"} from this layer.`
        : `Delete ${layer.name}?`
    );

    if (!confirmed) {
      return;
    }

    const remainingLayers = state.layers.filter((entry) => entry.id !== layerId);
    const nextActiveLayer = state.activeLayerId === layerId
      ? remainingLayers[layerIndex] || remainingLayers[layerIndex - 1] || remainingLayers[0] || null
      : remainingLayers.find((entry) => entry.id === state.activeLayerId) || remainingLayers[0] || null;

    state.layers = remainingLayers;
    state.customerLibrary = normalizeCustomerLibrary(state.customerLibrary, state.layers);

    if (nextActiveLayer) {
      state.activeLayerId = nextActiveLayer.id;
      state.bottles = cloneBottles(nextActiveLayer.bottles);
      state.zoneLabelOffsets = cloneZoneLabelOffsets(nextActiveLayer.zoneLabelOffsets);
    } else {
      state.layers = buildDefaultLayers();
      state.activeLayerId = state.layers[0].id;
      state.bottles = [];
      state.zoneLabelOffsets = cloneZoneLabelOffsets({});
    }

    state.selectedBottleId = null;
    state.pendingCatalogId = null;
    syncBottleSeed();
    render();
  }

  function removeCatalogFromLibrary(catalogId) {
    const product = getCatalogItem(catalogId);
    if (!product) {
      return;
    }

    syncActiveLayerSnapshot();

    const usedBottleCount = state.layers.reduce((total, layer) => {
      return total + (Array.isArray(layer.bottles) ? layer.bottles.filter((bottle) => bottle.catalogId === catalogId).length : 0);
    }, 0);

    const confirmed = window.confirm(
      usedBottleCount > 0
        ? `Remove ${product.name} from Customer Library? It will also be removed from ${usedBottleCount} placed bottle${usedBottleCount === 1 ? "" : "s"} across the saved layers in this sheet.`
        : `Remove ${product.name} from Customer Library?`
    );

    if (!confirmed) {
      return;
    }

    state.layers = state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      bottles: cloneBottles((Array.isArray(layer.bottles) ? layer.bottles : []).filter((bottle) => bottle.catalogId !== catalogId)),
      zoneLabelOffsets: cloneZoneLabelOffsets(layer.zoneLabelOffsets),
    }));

    const activeLayer = state.layers.find((entry) => entry.id === state.activeLayerId) || state.layers[0] || null;
    state.customerLibrary = state.customerLibrary.filter((entry) => entry !== catalogId);
    state.pendingCatalogId = state.pendingCatalogId === catalogId ? null : state.pendingCatalogId;

    if (activeLayer) {
      state.activeLayerId = activeLayer.id;
      state.bottles = cloneBottles(activeLayer.bottles);
      state.zoneLabelOffsets = cloneZoneLabelOffsets(activeLayer.zoneLabelOffsets);
    } else {
      state.bottles = [];
      state.zoneLabelOffsets = cloneZoneLabelOffsets({});
    }

    if (!state.bottles.some((bottle) => bottle.id === state.selectedBottleId)) {
      state.selectedBottleId = null;
    }

    syncBottleSeed();
    render();
  }

  function updateBottlePosition(bottle, position, fallbackLevel) {
    if (!bottle) {
      return;
    }

    if (position) {
      bottle.x = clamp(position.x, freePositionLimits.minX, freePositionLimits.maxX);
      bottle.y = clamp(position.y, freePositionLimits.minY, freePositionLimits.maxY);
      bottle.level = getLevelFromY(bottle.y);
      return;
    }

    const product = getCatalogItem(bottle.catalogId);
    const defaults = getDefaultBottlePosition(fallbackLevel || bottle.level || "middle", product ? product.type : "Perfume", 0);
    bottle.x = Number.isFinite(Number(bottle.x)) ? Number(bottle.x) : defaults.x;
    bottle.y = defaults.y;
    bottle.level = defaults.level;
  }

  function placeBottle(level, position) {
    if (state.pendingCatalogId) {
      placeCatalogBottle(state.pendingCatalogId, level, position);
      return;
    }

    const selectedBottle = getSelectedBottle();
    if (!selectedBottle) {
      return;
    }

    updateBottlePosition(selectedBottle, position, level);
    render();
  }

  function placeCatalogBottle(catalogId, level, position) {
    const bottle = createBottle(catalogId, level, position);
    if (!bottle) {
      return;
    }

    state.bottles.push(bottle);
    state.pendingCatalogId = null;
    state.selectedBottleId = bottle.id;
    render();
  }

  function selectBottle(bottleId) {
    state.pendingCatalogId = null;
    state.selectedBottleId = state.selectedBottleId === bottleId ? null : bottleId;
    render();
  }

  function removeSelectedBottle() {
    if (!state.selectedBottleId) {
      return;
    }

    state.bottles = state.bottles.filter((item) => item.id !== state.selectedBottleId);
    state.selectedBottleId = null;
    render();
  }

  function toggleZone(zoneId) {
    const bottle = getSelectedBottle();
    if (!bottle) {
      return;
    }

    if (bottle.zones.includes(zoneId)) {
      bottle.zones = bottle.zones.filter((entry) => entry !== zoneId);
    } else {
      bottle.zones = bottle.zones.concat(zoneId);
    }

    render();
  }

  function renderStageState() {
    const selectedBottle = getSelectedBottle();
    const hasAction = Boolean(state.pendingCatalogId || selectedBottle);
    const hasDropAction = Boolean(dragCatalogId);

    documentStage.classList.toggle("is-actionable", hasAction);
    documentStage.classList.toggle("is-dragging-catalog", hasDropAction);

    levelRows.forEach((row) => {
      row.classList.toggle("is-selected-level", Boolean(selectedBottle && row.getAttribute("data-level-row") === selectedBottle.level));
    });

    placementTargets.forEach((button) => {
      if (!hasDropAction) {
        button.classList.remove("is-drop-target");
      }
      button.disabled = !(hasAction || hasDropAction);
    });
  }

  function beginBottleDrag(event, bottleId) {
    if (!documentStage) {
      return;
    }

    const bottle = getBottle(bottleId);
    if (!bottle) {
      return;
    }

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    state.pendingCatalogId = null;
    activeBottleDrag = {
      bottleId: bottleId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: bottle.x,
      startY: bottle.y,
      wasSelected: state.selectedBottleId === bottleId,
      moved: false,
    };

    documentStage.classList.add("is-bottle-dragging");

    if (event.currentTarget && event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  }

  function moveBottleDrag(event) {
    if (!activeBottleDrag || activeBottleDrag.pointerId !== event.pointerId) {
      return;
    }

    const bottle = getBottle(activeBottleDrag.bottleId);
    if (!bottle || !documentStage) {
      return;
    }

    const rect = documentStage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const deltaX = ((event.clientX - activeBottleDrag.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - activeBottleDrag.startClientY) / rect.height) * 100;
    const distance = Math.hypot(event.clientX - activeBottleDrag.startClientX, event.clientY - activeBottleDrag.startClientY);

    if (distance > 4) {
      activeBottleDrag.moved = true;
    }

    if (activeBottleDrag.moved && state.selectedBottleId !== bottle.id) {
      state.selectedBottleId = bottle.id;
      renderStatus();
      renderSelectedBottlePanel();
      renderZoneLayer();
    }

    bottle.x = clamp(activeBottleDrag.startX + deltaX, freePositionLimits.minX, freePositionLimits.maxX);
    bottle.y = clamp(activeBottleDrag.startY + deltaY, freePositionLimits.minY, freePositionLimits.maxY);
    bottle.level = getLevelFromY(bottle.y);

    if (event.currentTarget) {
      event.currentTarget.style.left = `${bottle.x}%`;
      event.currentTarget.style.top = `${bottle.y}%`;
      event.currentTarget.classList.toggle("is-dragging", activeBottleDrag.moved);
    }

    renderStageState();
    event.preventDefault();
  }

  function endBottleDrag(event) {
    if (!activeBottleDrag || activeBottleDrag.pointerId !== event.pointerId) {
      return;
    }

    const bottleId = activeBottleDrag.bottleId;
    const moved = activeBottleDrag.moved;
    const wasSelected = activeBottleDrag.wasSelected;

    if (event.currentTarget && event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (error) {
        // no-op
      }
    }

    activeBottleDrag = null;
    documentStage.classList.remove("is-bottle-dragging");

    if (moved) {
      suppressBottleClickId = bottleId;
      state.selectedBottleId = bottleId;
      render();
      return;
    }

    if (!event.defaultPrevented && !wasSelected) {
      suppressBottleClickId = bottleId;
      state.selectedBottleId = bottleId;
      render();
      return;
    }

    render();
  }

  function renderBottles() {
    if (!bottleLayer) {
      return;
    }

    bottleLayer.innerHTML = state.bottles
      .map((bottle) => {
        const product = getCatalogItem(bottle.catalogId);
        if (!product) {
          return "";
        }

        const isSelected = bottle.id === state.selectedBottleId;
        const zoneNames = getBottleZoneNames(bottle);

        return `
          <button
            class="sheet-bottle sheet-bottle-free${isSelected ? " is-selected" : ""}"
            type="button"
            style="left:${escapeHtml(bottle.x)}%; top:${escapeHtml(bottle.y)}%;"
            data-select-bottle="${escapeHtml(bottle.id)}"
          >
            <span class="sheet-bottle-main">
              ${renderBottleVisual(product, "mini-bottle")}
              <span class="sheet-bottle-copy">
                <strong>${escapeHtml(product.name)}</strong>
                <small>${renderProductMeta(product, "product-meta product-meta-sheet")}</small>
                ${renderBottleZoneSummary(zoneNames, isSelected)}
              </span>
            </span>
            <span class="sheet-bottle-check" aria-hidden="true"></span>
          </button>
        `;
      })
      .join("");

    bottleLayer.querySelectorAll("[data-select-bottle]").forEach((button) => {
      const bottleId = button.getAttribute("data-select-bottle");

      button.addEventListener("click", function () {
        if (suppressBottleClickId === bottleId) {
          suppressBottleClickId = null;
          return;
        }

        selectBottle(bottleId);
      });

      button.addEventListener("pointerdown", function (event) {
        beginBottleDrag(event, bottleId);
      });

      button.addEventListener("pointermove", function (event) {
        moveBottleDrag(event);
      });

      button.addEventListener("pointerup", function (event) {
        endBottleDrag(event);
      });

      button.addEventListener("pointercancel", function (event) {
        endBottleDrag(event);
      });
    });
  }

  function renderZoneLayer() {
    const selectedBottle = getSelectedBottle();
    if (!selectedBottle) {
      zoneLayer.classList.remove("is-active");
      zoneLayer.innerHTML = "";
      return;
    }

    zoneLayer.classList.add("is-active");

    const hasChosenZones = selectedBottle.zones.length > 0;
    const visibleZones = hasChosenZones
      ? selectedBottle.zones
          .map((zoneId) => getZone(zoneId))
          .filter(Boolean)
      : zones;

    const hitMarkup = zones
      .map((zone) => {
        const position = getZoneMapPosition(zone);
        const offset = getZoneLabelOffset(zone.id);

        return `
          <button
            class="zone-hit"
            type="button"
            style="left:${escapeHtml(position.x)}; top:${escapeHtml(position.y)}; --zone-offset-x:${escapeHtml(`${offset.x}px`)}; --zone-offset-y:${escapeHtml(`${offset.y}px`)};"
            data-zone-hit="${escapeHtml(zone.id)}"
            aria-label="${escapeHtml(zone.label)}"
          ></button>
        `;
      })
      .join("");

    const clusterMarkup = visibleZones
      .map((zone) => {
        const position = getZoneMapPosition(zone);
        const offset = getZoneLabelOffset(zone.id);

        return `
          <button
            class="zone-cluster is-selected"
            type="button"
            style="left:${escapeHtml(position.x)}; top:${escapeHtml(position.y)}; --zone-offset-x:${escapeHtml(`${offset.x}px`)}; --zone-offset-y:${escapeHtml(`${offset.y}px`)};"
            data-zone-cluster="${escapeHtml(zone.id)}"
          >
            <span class="zone-cluster-dot" aria-hidden="true"></span>
            <span class="zone-cluster-label">${escapeHtml(zone.label)}</span>
          </button>
        `;
      })
      .join("");

    zoneLayer.innerHTML = hitMarkup + clusterMarkup;

    zoneLayer.querySelectorAll("[data-zone-hit]").forEach((button) => {
      button.addEventListener("click", function () {
        toggleZone(button.getAttribute("data-zone-hit"));
      });
    });

    zoneLayer.querySelectorAll("[data-zone-cluster]").forEach((cluster) => {
      cluster.addEventListener("pointerdown", function (event) {
        if (typeof event.button === "number" && event.button !== 0) {
          return;
        }

        const zoneId = cluster.getAttribute("data-zone-cluster");
        const offset = getZoneLabelOffset(zoneId);
        activeLabelDrag = {
          zoneId,
          dragHandle: cluster,
          cluster,
          hit: zoneLayer.querySelector(`[data-zone-hit="${zoneId}"]`),
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: offset.x,
          startY: offset.y,
          currentX: offset.x,
          currentY: offset.y,
          moved: false,
        };

        if (cluster.setPointerCapture) {
          cluster.setPointerCapture(event.pointerId);
        }

        cluster.classList.add("is-dragging");
        detachLabelDragListeners();
        document.addEventListener("pointermove", handleLabelDragMove, true);
        document.addEventListener("pointerup", handleLabelDragEnd, true);
        document.addEventListener("pointercancel", handleLabelDragCancel, true);
        event.preventDefault();
        event.stopPropagation();
      });
    });
  }

  function renderSelectedBottlePanel() {
    if (!selectedBottlePanel) {
      return;
    }

    const selectedBottle = getSelectedBottle();

    if (!selectedBottle) {
      selectedBottlePanel.hidden = true;
      selectedBottlePanel.innerHTML = "";
      return;
    }

    const product = getCatalogItem(selectedBottle.catalogId);
    const zoneNames = getBottleZoneNames(selectedBottle);

    selectedBottlePanel.hidden = false;
    selectedBottlePanel.innerHTML = `
      <div class="zone-editor-card">
        <div class="zone-editor-head">
          <div class="zone-editor-selected">
            ${renderBottleVisual(product, "zone-editor-bottle")}
            <div class="zone-editor-copy">
              <p>Selected product</p>
              <h3>${escapeHtml(product.name)}</h3>
            </div>
          </div>
          <p class="zone-editor-note">Drag the bottle anywhere on the sheet, then choose one or more spray zones. The body map updates automatically.</p>
        </div>
        <div class="zone-editor-grid">
          ${zones
            .map((zone) => {
              const selected = selectedBottle.zones.includes(zone.id);

              return `
                <label class="zone-check-item${selected ? " is-selected" : ""}">
                  <input class="zone-check-input" type="checkbox" data-zone-check="${escapeHtml(zone.id)}" ${selected ? "checked" : ""} />
                  <span class="zone-check-box" aria-hidden="true"></span>
                  <span class="zone-check-label">${escapeHtml(zone.label)}</span>
                </label>
              `;
            })
            .join("")}
        </div>
        <p class="zone-editor-summary">
          ${
            zoneNames.length > 0
              ? `Spray zones: ${escapeHtml(zoneNames.join(", "))}`
              : "No spray zones selected yet."
          }
        </p>
      </div>
    `;

    selectedBottlePanel.querySelectorAll("[data-zone-check]").forEach((input) => {
      input.addEventListener("change", function () {
        toggleZone(input.getAttribute("data-zone-check"));
      });
    });
  }

  function renderStatus() {
    const pendingProduct = getCatalogItem(state.pendingCatalogId);
    const selectedBottle = getSelectedBottle();
    const activeLayer = getActiveLayer();
    const activeLayerLabel = activeLayer ? activeLayer.name : "Current layer";

    if (pendingProduct) {
      sheetStatus.textContent = `${pendingProduct.name} is in the customer library. Click or drag it into ${activeLayerLabel}, then place it in Head, Heart, or Base on the sheet.`;
      if (adjustLabelsButton) {
        adjustLabelsButton.hidden = true;
      }
      removeSelectedButton.hidden = true;
      return;
    }

    if (selectedBottle) {
      const product = getCatalogItem(selectedBottle.catalogId);
      const zoneNames = getBottleZoneNames(selectedBottle);

      sheetStatus.textContent = zoneNames.length > 0
        ? `${activeLayerLabel} · ${product.name} · Zones: ${zoneNames.join(", ")}. Drag the bottle anywhere on the sheet. You can also drag the zone names directly.`
        : `${activeLayerLabel} · ${product.name} selected. Drag the bottle around the sheet, choose one or more spray zones, then drag the zone names if you want to reposition them.`;
      if (adjustLabelsButton) {
        adjustLabelsButton.hidden = true;
        adjustLabelsButton.classList.remove("is-active");
      }
      removeSelectedButton.hidden = false;
      return;
    }

    sheetStatus.textContent = `${activeLayerLabel} is active. Click a bottle in Search collection to add it to the customer library, then place it in Head, Heart, or Base and move it freely on the sheet.`;
    if (adjustLabelsButton) {
      adjustLabelsButton.hidden = true;
      adjustLabelsButton.classList.remove("is-active");
    }
    removeSelectedButton.hidden = true;
  }

  function renderSavedSheets() {
    if (!savedSheetsPanel) {
      return;
    }

    if (state.savedSheets.length === 0) {
      savedSheetsPanel.hidden = true;
      savedSheetsPanel.innerHTML = "";
      return;
    }

    savedSheetsPanel.hidden = false;
    savedSheetsPanel.innerHTML = `
      <div class="saved-sheets-head">
        <p>Saved sheets</p>
        <span>${state.savedSheets.length} saved</span>
      </div>
      <div class="saved-sheets-list">
        ${state.savedSheets
          .map((sheet, index) => {
            const isActive = sheet.id === state.currentSheetId;
            const bottleCount = Array.isArray(sheet.bottles) ? sheet.bottles.length : 0;
            const ownedCount = Array.isArray(sheet.customerLibrary) ? sheet.customerLibrary.length : 0;
            const layerCount = Array.isArray(sheet.layers) ? sheet.layers.length : 0;
            const summary = ownedCount > 0
              ? `${ownedCount} owned · ${layerCount} ${layerCount === 1 ? "layer" : "layers"}`
              : `${bottleCount} ${bottleCount === 1 ? "bottle" : "bottles"}`;

            return `
              <button class="saved-sheet-pill${isActive ? " is-active" : ""}" type="button" data-load-sheet="${escapeHtml(sheet.id)}">
                <strong>${escapeHtml(getSheetLabel(sheet, index))}</strong>
                <span>${escapeHtml(summary)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    savedSheetsPanel.querySelectorAll("[data-load-sheet]").forEach((button) => {
      button.addEventListener("click", function () {
        loadSavedSheet(button.getAttribute("data-load-sheet"));
      });
    });
  }

  function renderActionState() {
    if (downloadSavedButton) {
      downloadSavedButton.disabled = state.savedSheets.length === 0;
    }
  }

  function renderLayersPanel() {
    if (!layersPanel) {
      return;
    }

    const activeLayer = getActiveLayer();
    const ownedCount = state.customerLibrary.length;

    layersPanel.innerHTML = `
      <div class="panel-intro">
        <div class="panel-copy">
          <p>Layer combinations</p>
          <h2>Layers</h2>
        </div>
        <span class="panel-count">${escapeHtml(`${state.layers.length} total`)}</span>
      </div>
      <div class="layers-stack">
        ${state.layers
          .map((layer) => {
            const bottleCount = Array.isArray(layer.bottles) ? layer.bottles.length : 0;
            const ratio = ownedCount > 0
              ? `${bottleCount} / ${ownedCount} bottles`
              : `${bottleCount} ${bottleCount === 1 ? "bottle" : "bottles"}`;
            const canDelete = state.layers.length > 1;

            return `
              <article class="layer-chip${activeLayer && activeLayer.id === layer.id ? " is-active" : ""}">
                <button class="layer-chip-main" type="button" data-activate-layer="${escapeHtml(layer.id)}">
                  <strong>${escapeHtml(layer.name)}</strong>
                  <span>${escapeHtml(ratio)}</span>
                </button>
                <div class="layer-chip-tools">
                  <button class="panel-mini-action" type="button" data-rename-layer="${escapeHtml(layer.id)}">Rename</button>
                  <button class="panel-mini-action${canDelete ? "" : " is-disabled"}" type="button" data-delete-layer="${escapeHtml(layer.id)}"${canDelete ? "" : " disabled"}>Delete</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      <div class="layer-actions">
        <button class="ghost-button" type="button" data-create-layer>New layer</button>
      </div>
    `;

    layersPanel.querySelectorAll("[data-activate-layer]").forEach((button) => {
      button.addEventListener("click", function () {
        activateLayer(button.getAttribute("data-activate-layer"));
      });
    });

    layersPanel.querySelectorAll("[data-rename-layer]").forEach((button) => {
      button.addEventListener("click", function () {
        renameLayer(button.getAttribute("data-rename-layer"));
      });
    });

    layersPanel.querySelectorAll("[data-delete-layer]").forEach((button) => {
      button.addEventListener("click", function () {
        deleteLayer(button.getAttribute("data-delete-layer"));
      });
    });

    const createButton = layersPanel.querySelector("[data-create-layer]");
    if (createButton) {
      createButton.addEventListener("click", function () {
        createLayer();
      });
    }
  }

  function renderCustomerLibrary() {
    if (!customerLibraryPanel) {
      return;
    }

    const ownedItems = state.customerLibrary
      .map((catalogId) => getCatalogItem(catalogId))
      .filter(Boolean);

    customerLibraryPanel.innerHTML = `
      <div class="panel-intro">
        <div class="panel-copy">
          <p>Purchased collection</p>
          <h2>Customer Library</h2>
        </div>
        <span class="panel-count">${escapeHtml(`${ownedItems.length} owned`)}</span>
      </div>
      ${
        ownedItems.length === 0
          ? '<div class="owned-empty">Click a bottle in Search collection to add it here, then build layers from the customer’s own library.</div>'
          : `
            <div class="library-owned-grid">
              ${ownedItems
                .map((item) => `
                  <article class="owned-card${state.pendingCatalogId === item.id ? " is-pending" : ""}">
                    <button class="owned-card-select" type="button" draggable="true" data-library-product-id="${escapeHtml(item.id)}">
                      ${renderBottleVisual(item, "library-owned-bottle")}
                      <strong>${escapeHtml(item.name)}</strong>
                    </button>
                    <button class="panel-mini-action owned-card-remove" type="button" data-remove-library-product="${escapeHtml(item.id)}">Remove</button>
                  </article>
                `)
                .join("")}
            </div>
          `
      }
    `;

    customerLibraryPanel.querySelectorAll("[data-library-product-id]").forEach((button) => {
      button.addEventListener("click", function () {
        setPendingCatalog(button.getAttribute("data-library-product-id"));
      });

      button.addEventListener("dragstart", function (event) {
        dragCatalogId = button.getAttribute("data-library-product-id");
        documentStage.classList.add("is-dragging-catalog");
        placementTargets.forEach((target) => {
          target.disabled = false;
        });

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", dragCatalogId);
        }
      });

      button.addEventListener("dragend", function () {
        dragCatalogId = null;
        documentStage.classList.remove("is-dragging-catalog");
        renderStageState();
      });
    });

    customerLibraryPanel.querySelectorAll("[data-remove-library-product]").forEach((button) => {
      button.addEventListener("click", function () {
        removeCatalogFromLibrary(button.getAttribute("data-remove-library-product"));
      });
    });
  }

  function renderProductScroller() {
    const query = normalize(state.search);
    const filtered = catalog.filter((item) => {
      if (!query) {
        return true;
      }

      return [item.name, item.collection, item.type].some((value) => normalize(value).includes(query));
    });

    if (filtered.length === 0) {
      productScroller.innerHTML = '<div class="product-empty">No matching products.</div>';
      return;
    }

    productScroller.innerHTML = filtered
      .map((item) => {
        const pending = state.pendingCatalogId === item.id;
        const owned = state.customerLibrary.includes(item.id);

        return `
          <button class="product-card${pending ? " is-pending" : ""}" type="button" draggable="true" data-product-id="${escapeHtml(item.id)}">
            ${renderBottleVisual(item, "product-bottle")}
            <span class="product-copy">
              <strong>${escapeHtml(item.name)}</strong>
              <p>${renderProductMeta(item, "product-meta product-meta-card")}</p>
              ${owned ? '<span class="product-owned-badge">In library</span>' : ""}
            </span>
          </button>
        `;
      })
      .join("");

    productScroller.querySelectorAll("[data-product-id]").forEach((button) => {
      button.addEventListener("click", function () {
        const catalogId = button.getAttribute("data-product-id");
        addCatalogToLibrary(catalogId);
        setPendingCatalog(catalogId);
      });

      button.addEventListener("dragstart", function (event) {
        dragCatalogId = button.getAttribute("data-product-id");
        documentStage.classList.add("is-dragging-catalog");
        placementTargets.forEach((target) => {
          target.disabled = false;
        });

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", dragCatalogId);
        }
      });

      button.addEventListener("dragend", function () {
        dragCatalogId = null;
        documentStage.classList.remove("is-dragging-catalog");
        renderStageState();
      });
    });
  }

  function render() {
    syncActiveLayerSnapshot();
    renderStageState();
    renderBottles();
    renderZoneLayer();
    renderSelectedBottlePanel();
    renderStatus();
    renderSavedSheets();
    renderLayersPanel();
    renderCustomerLibrary();
    renderActionState();
    renderProductScroller();
  }

  function getExportStateFromSheet(sheet) {
    const nextLayers = resolveSnapshotLayers(sheet || {});
    const activeLayerId = nextLayers.some((layer) => layer.id === sheet.activeLayerId)
      ? sheet.activeLayerId
      : nextLayers[0].id;
    const activeLayer = nextLayers.find((layer) => layer.id === activeLayerId) || nextLayers[0];

    return {
      firstName: sheet.firstName || "",
      lastName: sheet.lastName || "",
      search: "",
      customerLibrary: normalizeCustomerLibrary(sheet.customerLibrary, nextLayers),
      layers: nextLayers,
      activeLayerId: activeLayerId,
      bottles: cloneBottles(activeLayer.bottles),
      zoneLabelOffsets: cloneZoneLabelOffsets(activeLayer.zoneLabelOffsets),
      zoneLayoutVersion: sheet.zoneLayoutVersion || "",
      isAdjustingLabels: false,
      selectedBottleId: null,
      pendingCatalogId: null,
      currentSheetId: sheet.id || null,
    };
  }

  async function waitForExportAssets() {
    await document.fonts.ready;

    const images = Array.from(exportRoot.querySelectorAll("img"));
    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          const done = function () {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };

          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        });
      })
    );
  }

  async function captureExportCanvas(html2canvas) {
    await waitForExportAssets();

    return html2canvas(exportRoot, {
      backgroundColor: "#fdfbf8",
      scale: 1.5,
      useCORS: true,
      logging: false,
      ignoreElements: function (element) {
        return element.hasAttribute("data-pdf-exclude");
      },
      windowWidth: Math.ceil(exportRoot.scrollWidth),
      windowHeight: Math.ceil(exportRoot.scrollHeight),
      scrollX: 0,
      scrollY: 0,
    });
  }

  function appendCanvasToPdf(pdf, canvas, isFirstPage) {
    const imgData = canvas.toDataURL("image/png", 1);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    if (!isFirstPage) {
      pdf.addPage();
    }

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }
  }

  function setButtonsBusy(activeButton, activeLabel) {
    const controls = [saveSheetButton, newSheetButton, downloadSavedButton, adjustLabelsButton].concat(pdfButtons).filter(Boolean);
    const originals = controls.map((button) => ({ button, text: button.textContent.trim() }));

    controls.forEach((button) => {
      button.disabled = true;
      if (button === activeButton && activeLabel) {
        button.textContent = activeLabel;
      }
    });

    return function restoreButtons() {
      originals.forEach((entry) => {
        entry.button.disabled = false;
        entry.button.textContent = entry.text;
      });
    };
  }

  async function exportSheetSnapshots(sheets, filename, activeButton, activeLabel) {
    const html2canvas = window.html2canvas;
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!exportRoot) {
      return;
    }

    const restoreButtons = setButtonsBusy(activeButton, activeLabel);
    const originalState = getWorkingStateSnapshot();

    try {
      if (!html2canvas || !jsPDF) {
        if (sheets.length === 1) {
          window.print();
        }
        return;
      }

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      for (let index = 0; index < sheets.length; index += 1) {
        applyWorkingState(getExportStateFromSheet(sheets[index]));
        render();
        const canvas = await captureExportCanvas(html2canvas);
        appendCanvasToPdf(pdf, canvas, index === 0);
      }

      pdf.save(filename);
    } catch (error) {
      console.error("Torti sheet export failed", error);
    } finally {
      applyWorkingState(originalState);
      restoreButtons();
      render();

      if (activeButton) {
        activeButton.blur();
      }
    }
  }

  async function exportCurrentView(button) {
    const snapshot = buildSheetSnapshot(state.currentSheetId);
    const first = snapshot.firstName || "Client";
    const last = snapshot.lastName || "Sheet";
    await exportSheetSnapshots([snapshot], `Torti-${first}-${last}.pdf`, button, "Preparing PDF...");
  }

  async function exportSavedSheets(button) {
    if (state.savedSheets.length === 0) {
      return;
    }

    await exportSheetSnapshots(state.savedSheets, "Torti-Saved-Sheets.pdf", button, "Preparing saved...");
  }

  firstNameInput.addEventListener("input", function () {
    state.firstName = firstNameInput.value;
  });

  lastNameInput.addEventListener("input", function () {
    state.lastName = lastNameInput.value;
  });

  searchInput.addEventListener("input", function () {
    state.search = searchInput.value;
    renderProductScroller();
  });

  removeSelectedButton.addEventListener("click", function () {
    removeSelectedBottle();
  });

  if (adjustLabelsButton) {
    adjustLabelsButton.addEventListener("click", function () {
      state.isAdjustingLabels = !state.isAdjustingLabels;
      render();
    });
  }

  saveSheetButton.addEventListener("click", function () {
    saveCurrentSheet();
  });

  newSheetButton.addEventListener("click", function () {
    createNewSheet();
  });

  downloadSavedButton.addEventListener("click", function () {
    exportSavedSheets(downloadSavedButton);
  });

  placementTargets.forEach((button) => {
    button.addEventListener("click", function (event) {
      const level = button.getAttribute("data-place-level");
      const coords = getStageCoordsFromClient(event.clientX, event.clientY);
      placeBottle(level, coords);
    });

    button.addEventListener("dragover", function (event) {
      if (!dragCatalogId) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      button.classList.add("is-drop-target");
    });

    button.addEventListener("dragenter", function (event) {
      if (!dragCatalogId) {
        return;
      }

      event.preventDefault();
      button.classList.add("is-drop-target");
    });

    button.addEventListener("dragleave", function () {
      button.classList.remove("is-drop-target");
    });

    button.addEventListener("drop", function (event) {
      if (!dragCatalogId) {
        return;
      }

      event.preventDefault();
      button.classList.remove("is-drop-target");
      const catalogId = dragCatalogId;
      dragCatalogId = null;
      const level = button.getAttribute("data-place-level");
      const coords = getStageCoordsFromClient(event.clientX, event.clientY);
      placeCatalogBottle(catalogId, level, coords);
    });
  });

  pdfButtons.forEach((button) => {
    button.addEventListener("click", function () {
      exportCurrentView(button);
    });
  });

  if (sheetDocument) {
    const preventPaperScroll = function (event) {
      if (!sheetDocument.classList.contains("is-paper-locked")) {
        return;
      }

      event.preventDefault();
    };

    sheetDocument.addEventListener("wheel", preventPaperScroll, { passive: false });
    sheetDocument.addEventListener("touchmove", preventPaperScroll, { passive: false });
    window.addEventListener("resize", function () {
      syncSheetPaperLock();
      renderZoneLayer();
    });
  }

  state.savedSheets = loadSavedSheets();
  state.layers = buildDefaultLayers();
  state.activeLayerId = state.layers[0].id;
  state.customerLibrary = [];
  syncBottleSeed();
  syncFormFields();
  syncSheetPaperLock();
  render();
})();
