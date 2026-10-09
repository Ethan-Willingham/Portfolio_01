#!/usr/bin/env python3
"""Refresh the original SpongeBob SquarePants TV roster and local portraits.

Run with Python 3 and Pillow installed. The wiki's character category is the
discovery index. Only individual named characters and recognizable creatures
are retained; numbered incidental lists, crowds and alternate poses are omitted.
Downloads are resized for the picker and encoded as WebP, with transparency
preserved. An actual original-series episode is recorded for every character.
Movie, spinoff, game and book appearances alone do not qualify. No wiki article
prose is copied.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets/spongebob"
API = "https://spongebob.fandom.com/api.php"
SOURCE = "https://spongebob.fandom.com/wiki/Category:Characters"
HEADERS = {"User-Agent": "Mozilla/5.0 (SpongeBob character research; image attribution retained)"}

MAIN = {
    "SpongeBob SquarePants (character)": ("spongebob-squarepants", "SpongeBob SquarePants"),
    "Patrick Star": ("patrick-star", "Patrick Star"),
    "Squidward Tentacles": ("squidward-tentacles", "Squidward Tentacles"),
    "Eugene H. Krabs": ("mr-krabs", "Mr. Krabs"),
    "Sandy Cheeks": ("sandy-cheeks", "Sandy Cheeks"),
    "Gary the Snail": ("gary-the-snail", "Gary the Snail"),
    "Sheldon J. Plankton": ("plankton", "Plankton"),
    "Karen Plankton": ("karen", "Karen"),
    "Pearl Krabs": ("pearl-krabs", "Pearl Krabs"),
    "Mrs. Puff": ("mrs-puff", "Mrs. Puff"),
}
RECURRING = set("""Larry the Lobster|Squilliam Fancyson|Mermaid Man|Barnacle Boy|Flying Dutchman|Bubble Bass|Bubble Buddy (character)|Perch Perkins|Fred|Tom (Inc 6)|Scooter|Old Man Jenkins|Old Man Jenkins (Inc 80)|Old Man Jenkins (Inc 86)|Patchy the Pirate|Potty the Parrot|King Neptune|Grandma SquarePants|Harold SquarePants|Margaret SquarePants|Mama Krabs|Mrs. Dutchman|Nosferatu|Slappy|Kevin C. Cucumber|Kelpy G|Realistic Fish Head|French Narrator|Painty the Pirate|Hoopla|Reg|Jenkins|Nat Peterson|Peterson|Nancy Suzy Fish|Harold|Shubie|Sandals|Debbie Rechid|Don the Whale""".split("|"))
VILLAINS = set("""Man Ray|Dirty Bubble|DoodleBob|Dennis|Cyclops|Tattletale Strangler|Flats the Flounder|Alaskan Bull Worm|Atomic Flounder|Jumbo Shrimp|Sinister Slug|Master Udon|Fuzzy Acorns|The Moth|The Fisherman|The Tickler|The Appetizer|The Cackling Cruiser|The Coral Creep|The Drastic Radicals|The Takeoverer|Lord Poltergeist|Madame Hagfish|Dr. Marmalade|King Poseidon|Burger Beard|Prawn|The Flying Dutchman|Lady Zombie|Lady Dracula|Smitty Werbenjägermanjensen|Yeti Krab|Al Gristlepuss|Miss Gristlepuss|Sergeant Roderick|Lord Royal Highness|The Mawgu|Blobba Yaga|Abominable snow mollusk""".split("|"))
MOVIES = set("""Dennis|Cyclops|Princess Mindy|Burger Beard|Bubbles (character)|King Poseidon|Sage|David Hasselhoff|El Diablo (character)|Reggie|Tiffany Haddock|Kyle (Saving Bikini Bottom: The Sandy Cheeks Movie)|Nance|Phoebe|Dr. Marmalade|P!nk|Sparky (Saving Bikini Bottom: The Sandy Cheeks Movie)""".split("|"))
SPINOFFS = set("""Bunny Star|Cecil Star|GrandPat Star|Squidina Star|Narlene|Nobby|Rube Goldfish|Patrick Revere|Ouchie|Mop|Tinkle|Inga Star|Inga-Tron|Gale Doppler|Nurse Helga|Ma Narwhal|Pa Narwhal|Swirl Fudge|Camp Counselor Kraus|Counselor Upturn|Quincy|Skip (The Patrick Star Show)|Ed Star|Sir Cecil|Cousin Marvin|Jabber|Marvin (animal control officer)|Bunny CaveStar|Cecil CaveStar|Squidina CaveStar""".split("|"))
ARCHETYPES = {"Sea bear", "Sea rhinoceros", "King jellyfish", "Queen jellyfish"}
NAMED_INCIDENTALS = {
    "Incidental 41": ("nat-peterson", "Nat Peterson"),
    "Incidental 116": ("dr-gill-gilliam", "Dr. Gill Gilliam"),
}
SEARCH_ALIASES = {
    "Fred": ["My leg", "My leg guy", "Fred the Fish", "Incidental 1"],
    "Tom (Inc 6)": ["Chocolate guy", "Chocolate man", "Incidental 6"],
    "Suzy": ["Debbie Rechid", "Nancy Suzy Fish"],
    "Judy": ["Shubie"],
    "Officer Murphy": ["Officer John"],
    "Eugene H. Krabs": ["Eugene H. Krabs"],
    "Sheldon J. Plankton": ["Sheldon J. Plankton"],
    "Karen Plankton": ["Karen Plankton"],
}
NAMED_INCIDENTALS.update({
    "Incidental 4": ("incidental-4", "Steven"),
    "Incidental 5": ("incidental-5", "John"),
    "Incidental 8": ("incidental-8", "Tina"),
    "Incidental 14": ("incidental-14", "Evelyn"),
    "Incidental 22": ("incidental-22", "Carol (waitress)"),
    "Incidental 23": ("incidental-23", "Charlie (fish)"),
    "Incidental 24": ("incidental-24", "Frank (muscle fish)"),
    "Incidental 26": ("incidental-26", "Joe (zookeeper)"),
    "Incidental 27": ("incidental-27", "Jimmy"),
    "Incidental 30": ("incidental-30", "Meep Meep"),
    "Incidental 36": ("incidental-36", "Harold (purple fish)"),
    "Incidental 37A": ("incidental-37a", "Tuck Tucker"),
    "Incidental 42": ("incidental-42", "Frank (tall fish)"),
    "Incidental 47": ("incidental-47", "Sadie"),
    "Incidental 48": ("incidental-48", "Rochelle"),
    "Incidental 49": ("incidental-49", "Nurse Rechid"),
    "Incidental 49A": ("incidental-49a", "Janice"),
    "Incidental 63": ("incidental-63", "Martha"),
    "Incidental 64": ("incidental-64", "Bruiser"),
    "Incidental 65": ("incidental-65", "Billy (green fish)"),
    "Incidental 73": ("incidental-73", "Harris"),
    "Incidental 81": ("incidental-81", "Scaley"),
    "Incidental 81A": ("incidental-81a", "Dusty"),
    "Incidental 82": ("incidental-82", "Mabel (elderly fish)"),
    "Incidental 84": ("incidental-84", "Mabel (other elderly fish)"),
    "Incidental 91": ("incidental-91", "Old Man Jenkins (seahorse rider)"),
    "Incidental 92": ("incidental-92", "Gonzalez"),
    "Incidental 92A": ("incidental-92a", "Dennis (farmer)"),
    "Incidental 93": ("incidental-93", "Miss Shell"),
    "Incidental 104": ("incidental-104", "Gale"),
    "Incidental 105": ("incidental-105", "Frank (yellow fish)"),
    "Incidental 107B": ("incidental-107b", "Buxton"),
    "Incidental 108": ("incidental-108", "Dale"),
    "Incidental 114": ("incidental-114", "Lenny"),
    "Incidental 115": ("incidental-115", "Mabel"),
    "Incidental 118": ("incidental-118", "Officer Slugfish"),
    "Incidental 124": ("incidental-124", "Prudence"),
    "Incidental 127": ("incidental-127", "Nathaniel"),
    "Incidental 151": ("incidental-151", "Tyler"),
    "Incidental 152": ("incidental-152", "Billy"),
    "Incidental 153": ("incidental-153", "Susie"),
    "Incidental 155": ("incidental-155", "Frank (orange fish)"),
    "Incidental 158": ("incidental-158", "Billy (beanie kid)"),
    "Incidental 205": ("incidental-205", "Pbblutt Plaaart"),
    "Incidental 211": ("incidental-211", "Bert (Rock Bottom fish)"),
    "Incidental 220": ("incidental-220", "Pbbfit Pbbfit"),
    "Incidental 222": ("incidental-222", "Frank (Rock Bottom fish)"),
})
SEARCH_ALIASES.update({
    "Incidental 8": ["Fran", "Clementine"],
    "Incidental 14": ["Annette"],
    "Incidental 24": ["Tibor", "Wayne", "Frank"],
    "Incidental 42": ["Dave", "Percy", "Frank"],
    "Incidental 105": ["Frank"],
    "Incidental 155": ["Frank"],
    "Incidental 222": ["Frank"],
    "Incidental 27": ["Gus"],
    "Incidental 37A": ["Guybesideu3"],
    "Incidental 63": ["Mrs. Smith", "Doris"],
    "Incidental 64": ["Thadeus"],
    "Incidental 82": ["Old Man Old Lady"],
    "Incidental 104": ["Jennifer"],
    "Incidental 115": ["Tammy", "Jill", "Monica"],
    "Incidental 116": ["Gill Gilliam", "Dr. Fishberg"],
    "Incidental 118": ["Johnson"],
    "Incidental 151": ["Billy", "Timmy"],
    "Incidental 153": ["Sissy"],
})
SAME_CHARACTER_FORMS = {
    "Abominable Starfish", "Abrasive Sponge", "Captain Magma", "Dirty Dan",
    "Elastic Waistband", "Miss Appear", "The Quickster (character)",
    "Wonder Whale", "The Tremendous Trunk", "Snow Yellow (character)",
    "Patrick the Snowman (character)", "Krabby Patty Patrick", "Spongy Spongy",
    "Squid Doodle", "Not SpongeBob", "Supersized Patty", "Prisoner A",
    "Prisoner B", "Prisoner D",
}
PHOTO_FALLBACKS = set("""
artist beanie-mcbean ben-gums bullfrog can carol-spongebob-s-big-birthday-blowout
cavey chip-i country-squirrel cyclops dancing-anemone david-hasselhoff davy-jones
desert-sandwich dog-walker don fisherman french-canadian-narrator french-narrator
george giant-man giraffe gorilla gorilla-boss guy-in-shower hans jerry jimbob
live-action-broccoli live-action-cow live-action-dolphins live-action-whale
longbeard minnie-mermaid moon mr-charleston mr-manward mr-pirateson
mr-puff-krusty-love mr-slabs mrs-johnson muscle-guy nosferatu old-coot old-sailor
p-nk painty-the-pirate patchy-the-pirate patrick-live-action pearl-slabs pie-dragon
rat real-life-drummer realistic-fish-head robin-williams rosie-cheeks-pest-of-the-west
santa-claus seagull security-guard-truth-or-square storyboard-artist
subliminal-message-girl surface-world-pizza-chef the-chief the-foot
the-guy-on-the-penny tyrannosaurus-rex volcano-sauce-drop vulture will-ferrell
woman-customer x-29488
""".split())

# One-word names cannot be distinguished from job titles by capitalization.
# These are individual wiki character entries rather than crowds or species lists.
SINGLE_NAMES = set("""Agnes|Al (Something Stupid This Way Comes)|Alvin|Amoeba|Annette|Arf|Barb|Barbara|Barker|Barney|Barry (Bizarro Bottom)|Basia|Beard|Beatrice|Becky|Beelzebass|Bernie|Bert (Porous Pockets)|Bessy|Betsy|Beulah|Bill|Billy (blue kid)|Billy (Inc 103)|Billy (Inc K1)|Bim|Birdie|Birdy|BlackJack (character)|Bladur|Blowtorch|Boaty (Gone)|Bomb-Bot|Brance|Bubbleman|Bubbles (character)|Buford (crocodile)|Buford (Inc Y2)|Bum|Bun-Bot|Burrower|BZZT-Bot|C.H.U.M.|Cakey|Candy|Carl (Jellyfish geek G12)|Carl (manager)|Carl (Patrick's family)|Carol (SpongeBob's Big Birthday Blowout)|Cashina|Cavey|Chance|Charles (Grooming Gary)|Charles (Welcome to the Bikini Bottom Triangle)|Charlie (ghost)|Charlie (pillow)|ChefBob (character)|Cherry|Chet|Chip (fish)|Chomp-Bot|Chuck|Chumbot|Cindy|Clamu|Clarabelle|Clay (The Perfect Camper)|Clem|Cletus (Inc Y1)|Cletus (Inc Y7)|Cletus (Swamp Mates)|Clint (Who's a Big Boy?)|Conscience|Coupe|Cowbones|Crupski|Cuda|Cyclops|Dani|Death|Demon|Dennis|Dolly|Don|Donna|Donnie|DoodleBob|DoodlePants|Dorudon|Doug|Drifter|Drizzle|Duststar|Dutch|Dylan|E.M.I.L.P.|Earworm (character)|Einstein|Elwood|Esmerelda (snail)|Esmerelda (spider)|Eugene (Inc F17)|Exo-Woman|Felicia|Felix|Fergus|Fiasco (character)|Fifi (A Place for Pets)|Fifi (Gary in Love)|Fingers (prisoner)|Fishy|FitzPatrick (character)|Flankton|Flea|Flinger|Flipper|Floyd|Fodder|Fogger|Foofie|France|Frank (Inc whale)|Frank (Neptune's advisor)|Frank (store owner)|Frankenfish|Frankenwich|Frankie|Fred|Frederica|Fredrick|G-Love|Genie|George|Geppetto|Gerhard|Gertruden|Gills|Ginger|Gladys|Glarg|Go-Woman|Gordon|Gorilla|Gramma|Greasy|Gunther (Patrick's Star)|Guru|Guy|Guzzler|Haibi|Hairball|Ham-Mer|Hanna|Hans|Harold|Harvey|Hazelnut|Helga|Hoopla|Howard|Howdini|Igor (Dunces and Dragons)|Igor (The Kreepy Krab)|Inky|Iversquid|Jabbersquawky|Jagger|Janet|Jeeves|Jeke|Jellyfish|Jenkins|Jennifer (sea anemone)|Jennifer (Teen 15)|Jerry|Jethra|Jim (Champ 1)|Jim (The Original Fry Cook)|JimBob|JK|Jody|Johnny (anchovy)|Johnson|Jonnie|Joshua|Judy|Julio|Junior|Junior (BassWard)|Junior (Trenchbillies)|Karla|Kevin (1830s)|Killtron-5000|Kissy|Klaus|Knack|Knox|Kyle (Saving Bikini Bottom: The Sandy Cheeks Movie)|Lance|Leftover|Lefty|Leilani|LeMont|Leprechaun|Limia|Lloyd (Attendant 2)|Longbeard|Lonnie|Lou|Lucky|Luther|Macadamia|Mama-Squatch|Marco|Marina|Marty|Marvin (animal control officer)|Mary|Matilda|Mattress (character)|Maurice|Maw|Maximus|Mel|MERV|Mike|Mildred|Mo|Moby|Monsoon|Moppy|Moronicus|Morrie|Mortimer|Morty|Mulligor|Myron|Myrtle|Nance|Nando|Narlene|Nautilus|Ned|Nelly|Nelson|Nick (The Fry Cook and the Elves)|Ninjelly|Nixie|Nobby|Nocturna|Noodleman|Nosferatu|Notodoris|Octward|Olaf (teal "Viking")|Olaf (Viking 1)|Olaf (Viking 2)|Olaf (Viking 3)|Olaf (Viking 5)|Olaf (Viking 6)|Olaf (Viking 8)|Olaf (Viking guy 1)|Olaf (Viking guy 2)|Orville|Otto (robot)|Otto (student)|Ouchie|P!nk|P-1000|Papa-Squatch|Paris|Patar|Patina|Patty (Dream Hoppers)|Patty (Fear of a Krabby Patty)|Patty (The Fry Cook and the Elves)|Patty (To Love a Patty)|Pbbblt|Pedro|Peppercorn|Peterson|Petunia|Pffht|Phoebe|Phone|Phorkys|Phyllosoma|Pigulon|Pinkeye|Pinocchio|Pinzarossa|Pistachio|Planky|Polly|Popper|Popsic|Prawn|Preston|Preston (Bizarro Bottom)|Prickles|Pterascallop|Q.T.-π|Quacken|Quincy|Rainbow|Rainchild|Raisin|Ray|Rea|Reg|Regigilled|Rex|Rhiannon|Richard|Rocky|Rocky (convict and crook)|Rodger|Roger (Cephalopod Lodge)|Roger (chick)|Roger (fish)|Roh|Rolly|Ronnie|Roxy|Rrarrg|Rubedor|Rufus|Rupert|S.A.L.|Sage|Sal (Lost in Bikini Bottom)|Sal (The Hankering)|Sammy|Sandals|Sandman|Sandroid|Sarge|Sausage-Bard|Scooter|Sebastian|Seymour (plankton)|Shalmon|Sharkface|Shecky|Shelley|Sherbet|Shmandrake|Simmy|Skip (The Patrick Star Show)|Slammer|Slamvil|Slappy|Sleepy-Time|Slick|Slimebiscuit|Slippy|Sludge|Snakey|Snapper|Snellie|Snug|Sock-a-dactyl|Socky|Sparklenose|Sparky (Saving Bikini Bottom: The Sandy Cheeks Movie)|Sparky (SpongeHenge)|Spike|Spinner|SpongeGar|Spot|Sprinkle|Squeaky|Squidabeth|Squidette|SquidHarp|Squidmund|Squidnote|Squilvia|Squog|Stan (Krusty Koncessionaires)|Steve|Stinky|Stompy|Sunshine|Suzy|Tally|Tandy|Tapey|Tar-Tar|Ted|Ted (Bizarro Bottom)|Tenderizer|Timmy (Hiccup Plague)|Timmy (Inc 160)|Tina (Hiccup Plague)|Tinkle|Tom (Inc 6)|Tom (Prison guard 1)|Tom (robot)|Tony|Triton|Tubelet|Twitch|Urnie|Victor|Virus|Wally|Washy|Wiggly|Wiggy|WillyBob|Wormy (character)|Yorick|Zip""".split("|"))

EXCLUDE = re.compile(
    r"incidental|family|clones|crowd|\bteam\b|\bband\b|\bcrew\b|\bgang\b|\bcommittee\b|\blist\b|"
    r"\bactors\b|\bmanagers\b|\bworkers\b|\bcadets\b|\bservants\b|\bchildren\b|\bsisters\b|"
    r"\bnephews\b|\bfriends\b|\bbrothers\b|\btroops\b|\btypes\b|\bpatrons\b|\bcreatures\b|"
    r"\bCitizens\b|\bpartnership\b|\bgal pals\b|\bjustice league\b|\bkrusty krew\b|"
    r"\bgroup\b|\bpods\b|\bsharks\b|\bboys\b|\bex-husbands\b|\bdoppelg|\borchestra\b|"
    r"\bthe pirates\b|\broyal order\b|\bcompany\b|\bconstruction\b|\bCHOIR\b|\binhabitants\b|"
    r"\bmild ones\b|\blos diablos\b|\bflimflam\b|\bmipsey and pipsey\b|\baquatic adventurers\b|"
    r"\bCrustacean Crime Theater\b|\bCircus Sea Fleas\b|\bVisual Aids\b|\bSilly, Confused\b|"
    r"\bSpongeBrian\b|\bSweetie Scouts\b|\bHAZMAT Unit\b|\bInternal Affairs\b|\bPenny Pinchers\b|"
    r"\bNew Kelp City Delinquents\b|\bNed and the Needlefish\b|\bSpongeBob SuperFans\b|"
    r"\bSaltwater Sam, featuring\b|\bAnimated\b|\bcaricature\b|\bhouse\b|\bmanager\b|"
    r"\barmy\b|\bagents\b|\bleague\b|\brobots\b|\bMoe Bros\b|\bLow Tides\b|"
    r"\bRock Bottomites\b|\bBikini Bottom Barnacles\b|\bBikini Bottom Sanitation Police\b|"
    r"\bMr\. and Mrs\.\b|\bBird Brains\b|\bDrastic Radicals\b|\bThe Bikini Bottom fish\b|"
    r"\bTeenagers\b|\(location\)|"
    r"\bemployee\b|\bfigurine\b|\bhat\b|\btrident\b|\bstatue\b|\banalyzer\b|\bprinter\b|"
    r"\bplankton and the\b|\bspongeBob and patrick\b|\bfan club\b|\bmonkey middle\b|"
    r"['’]s\b|s['’](?:\s|$)|"
    r"^(?:Alien (?:Bubble Bass|Upturn)|Alternate-Universe|Animatronic|Bubble Patrick|Bug Patrick|"
    r"BunnyKrabs|Cave Patrick|Chum Krabs|Clockwork Karen|Cyborg Bunny|Doodle (?:Gary|Mr\.|Patrick|Sandy|Squidward)|"
    r"Dreaded Patrick|Edwardian Age Mermaid Man|Fake |Fresh and Natural Sponge|Future |Giant Krabs|"
    r"Green PlanKrab|Hopalong Squidward|Ideal Plankton|Lab Squidward|Lady Squidward|Mechanical Plankton|"
    r"Mega Karen|Mini |Money Krabs|Mutated Plankton|New Karen|New Pat-Tron|Off.Model|"
    r"Pecan Sandy|Pecos Patrick|Pearl Plankton|Pillow SpongeBob|Pinhead Larry|Prehistoric |Princess Pearl Krabs|"
    r"Puppet Squidward|Queen Karen|RandomLand|Red Mist Squidward|Red PlanKrab|Robo |Robot (?:Krabs|Patrick|SpongeBob|Squidward)|"
    r"Sandy Evil-Cheeks|Sheriff Sandy|Snow Yellow|SpongeBot|Stone SpongeBob|Super (?:Evil|Smart|Snarky) Karen|"
    r"Tiny (?:Patrick|SpongeBob)|Winter Squidlock|Doodle Squeaky)|"
    r"^(?:Abominable Starfish|Abrasive Sponge|Captain Magma|Dirty Dan|Elastic Waistband|Miss Appear|"
    r"The Quickster|Wonder Whale|The Tremendous Trunk|CreamBob ConePants|Patrick the Snowman|"
    r"Krabby Patty Patrick|Spongy Spongy|Squid Doodle|Not SpongeBob|Supersized Patty)$|"
    r"\b(?:timeline|Bikini Bottom 2|Welcome to Binary Bottom)\b|"
    r"(?:^|\s)(?:Teen|New Fancy|Puffy Fluff|Inmate FP|Muscle Fish|Jellyfish geek)\s*[A-Z]*\d|"
    r"(?:Bubble Bass|Lady Upturn|Mama Bass|Mrs\. Puff) robot$",
    re.IGNORECASE,
)


def request(url, retries=4):
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=45) as response:
                return response.read()
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(.6 * (attempt + 1))


def api(params):
    return json.loads(request(API + "?" + urlencode({"format": "json", **params})))


def discover(cache):
    if cache.exists():
        return json.loads(cache.read_text())
    pages = []
    params = {"action": "query", "list": "categorymembers", "cmtitle": "Category:Characters", "cmnamespace": 0, "cmlimit": 500}
    while True:
        data = api(params)
        pages.extend(data["query"]["categorymembers"])
        print(f"Discovered {len(pages)} character pages", flush=True)
        if "continue" not in data:
            break
        params.update(data["continue"])
        time.sleep(.15)
    cache.write_text(json.dumps(pages))
    return pages


def category_pages(category, cache):
    if cache.exists():
        return json.loads(cache.read_text())
    pages, params = [], {"action": "query", "list": "categorymembers", "cmtitle": "Category:" + category, "cmnamespace": 0, "cmlimit": 500}
    while True:
        data = api(params)
        pages.extend(data["query"]["categorymembers"])
        if "continue" not in data:
            break
        params.update(data["continue"])
    cache.write_text(json.dumps(pages))
    return pages


def revision_texts(pages, cache_dir, prefix):
    texts = {}
    for offset in range(0, len(pages), 50):
        cache = cache_dir / f"{prefix}-{offset}.json"
        batch = pages[offset:offset + 50]
        data = json.loads(cache.read_text()) if cache.exists() else None
        if data is None or set(data["query"]["pages"]) != {str(p["pageid"]) for p in batch}:
            data = api({"action": "query", "prop": "revisions", "pageids": "|".join(str(p["pageid"]) for p in batch), "rvprop": "content", "rvslots": "main"})
            cache.write_text(json.dumps(data))
        for page in data["query"]["pages"].values():
            texts[page["title"]] = page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("*", "")
    return texts


def wiki_links(text):
    return [link.split("|")[0].split("#")[0].strip().replace("_", " ") for link in re.findall(r"\[\[([^\]]+)\]\]", text)]


def episode_character_index(episode_texts):
    appearances = {}
    for episode, text in episode_texts.items():
        header = re.search(r"^==+\s*Characters\s*==+\s*", text, re.M | re.I)
        if not header:
            continue
        section = text[header.end():].split("\n==")[0]
        for line in section.splitlines():
            if not line.lstrip().startswith("*") or re.search(r"\b(?:mentioned|cut|deleted|unused)\b", line, re.I):
                continue
            for title in wiki_links(line):
                appearances.setdefault(title, episode)
    return appearances


def series_evidence(title, text, episodes, episode_index):
    # Only actual character appearance parameters count. Family references,
    # voice credits, related-page templates and trivia do not establish scope.
    for prop in ("first-appearance", "appearance", "appearances"):
        match = re.search(r"\|\s*" + prop + r"\s*=\s*(.*?)(?=\|\s*[a-zA-Z][\w-]*\s*=|\n\}\})", text, re.S)
        if match:
            for part in re.split(r"<br\s*/?>|\n", match[1], flags=re.I):
                if re.search(r"\b(?:mentioned|deleted|unused)\b", part, re.I):
                    continue
                for episode in wiki_links(part):
                    if episode in episodes:
                        return episode, "character appearance infobox"
    if title in episode_index:
        return episode_index[title], "original episode character list"
    for heading in re.finditer(r"^(={2,3})\s*(?:Role in (?:series|SpongeBob SquarePants)|SpongeBob SquarePants|Role in episodes?)\s*\1\s*$", text, re.M | re.I):
        after = text[heading.end():]
        end = re.search(r"^={2," + str(len(heading[1])) + r"}[^=]", after, re.M)
        section = after[:end.start()] if end else after
        for episode in wiki_links(section):
            if episode in episodes:
                return episode, "original-series role section"
    return None


def is_candidate(title, text=""):
    # A species page can provide a recognizable single creature design, while
    # clubs, bands and crowds do not represent an individual fight choice.
    individual_group_designs = ARCHETYPES | {
        "Amoeba", "Bubble giraffe", "Fangtooth fish", "Flea", "Jellyfish",
        "Jelly bee", "Invisible fish", "Jumbo Shrimp", "Roxy", "Seagull",
        "Sea urchin", "Sea bunny", "Sea anemone", "Sea gorilla",
        "Spotted glistening meadow worm", "Robot (House Sittin' for Sandy)",
    }
    if "[[Category:Groups]]" in text and title not in individual_group_designs:
        return False
    if title in SAME_CHARACTER_FORMS:
        return False
    if title in NAMED_INCIDENTALS or title in ARCHETYPES:
        return True
    # Parentheses often contain an episode title, whose possessives should not
    # accidentally hide a character such as Frank (Neptune's advisor).
    base = title.split(" (")[0]
    if re.search(r"^(?:Unknown\b|Doctor\s*\d|Ghost\s*\d|Fish\s*\d|Squid\s*\d|Snail\s*\d|Plankton\s*\d|PKTN\s*\d|Planktons row|Lodge member\s*\d|Machine\s*\d|Navy inc|Senior\s*\d|Viking\s*\d|SecurityGuardGW\s*\d)", base, re.I):
        return False
    if re.search(r"\b(?:snails|worms|robbers|buddies|carolers|dwellers|chimpanzees|scallops|cockroaches|cyclists|monsters|elves|tikis|executioners|firefighters|fishermen|germs|flies|sycophants|chorus|couple|hobos|puppies|jelliens|spotters|knights|lampreys|girls|miners|kids|peanut worms|pirates|glove guards|monks|trees|baboons|chimps|whelks|ninjas|cows|smellies|babies|racers|aliens|inspectors|goons)\b", base, re.I):
        return False
    if base in {"Anchovies", "Nematodes", "Jellyspotters", "Scallops and clams", "Faux-chovies", "Fused-together characters", "GrandPat sycophants", "Pre-fab homes", "Slappy heads", "Human football players"}:
        return False
    if EXCLUDE.search(base) or re.search(r"(?:^|\s)(?:Teen|BunnyBunnsKids|BusinessFish|Inmate FP|Jellyfish geek|Puffy Fluff|New Fancy|Prisoner)\s*[A-Z]*\d|\bincidentals\b", title, re.I):
        return False
    if title in MAIN or title in RECURRING or title in VILLAINS or title in MOVIES or title in SPINOFFS:
        return True
    if title in SINGLE_NAMES:
        return True
    return True


def slug(title):
    value = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def describe(page):
    title = page["title"]
    name = title.removesuffix(" (character)")
    id_ = slug(name)
    if title in MAIN:
        id_, name = MAIN[title]
        group = "Main cast"
    elif title in NAMED_INCIDENTALS:
        id_, name = NAMED_INCIDENTALS[title]
        group = "Recurring"
    elif title in RECURRING:
        group = "Recurring"
    elif title in VILLAINS:
        group = "Villains"
    elif re.search(r"\b(?:SquarePants|Cheeks|Star|Krabs|Tentacles|Plankton|Dartfish)\b", title) and not re.search(r"\b(?:Captain|Dead Eye|Dr\.|Mr\.|Mermalair)\b", title):
        group = "Family"
    else:
        group = "Minor characters"
    item = {"id": id_, "name": name.replace("\u2014", ", "), "group": group,
            "image": f"assets/spongebob/characters/{id_}.webp",
            "sourcePage": "https://spongebob.fandom.com/wiki/" + quote(title.replace(" ", "_")),
            "sourceImage": page["original"]["source"],
            "seriesEpisode": page["seriesEpisode"].replace("\u2665", "Heart"),
            "seriesSource": "https://spongebob.fandom.com/wiki/" + quote(page["seriesEpisode"].replace(" ", "_")),
            "seriesEvidence": page["seriesEvidence"]}
    if title in SEARCH_ALIASES:
        item["aliases"] = SEARCH_ALIASES[title]
    return item


def image_fallback(page):
    """Use only the article's actual infobox image, never a shared wiki banner."""
    data = api({"action": "parse", "pageid": page["pageid"], "prop": "text"})
    markup = data.get("parse", {}).get("text", {}).get("*", "").replace('\\"', '"')
    tag = re.search(r'<img[^>]*class="pi-image-thumbnail"[^>]*>', markup)
    if not tag:
        return None
    src = re.search(r'\bsrc="([^"]+)"', tag[0])
    if not src or "TBA.png" in src[1]:
        return None
    url = re.sub(r'/scale-to-width-down/\d+', '', src[1])
    return {**page, "original": {"source": url}}


def download(page, force=False):
    item = describe(page)
    output = ROOT / item["image"]
    if not output.exists() or force:
        url = item["sourceImage"]
        # Ask the source CDN for a bounded copy before encoding the local WebP.
        url = url.replace("/revision/latest?", "/revision/latest/scale-to-width-down/640?")
        raw = request(url)
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            im.thumbnail((640, 640), Image.Resampling.LANCZOS)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            im.save(output, "WEBP", quality=88, method=6)
    with Image.open(output) as im:
        im.verify()
    with Image.open(output) as im:
        item.update(width=im.width, height=im.height)
        fallback = output.with_suffix(".png")
        if fallback.exists() or item["id"] in PHOTO_FALLBACKS:
            im.save(fallback, "PNG", optimize=True)
            item["fallbackImage"] = fallback.relative_to(ROOT).as_posix()
    return item


def write_roster(items, discovered):
    order = {name: i for i, name in enumerate(["Main cast", "Recurring", "Villains", "Family", "Minor characters"])}
    main_order = {info[0]: i for i, info in enumerate(MAIN.values())}
    items.sort(key=lambda x: (order[x["group"]], main_order.get(x["id"], 999), x["name"].casefold()))
    first_ids = set(json.loads((DEST / "first-catalog-ids.json").read_text()))
    data = {"version": 3, "scope": "original-series", "scopeName": "SpongeBob SquarePants TV series",
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sourceName": "Encyclopedia SpongeBobia", "sourceUrl": SOURCE,
            "discoveredCharacterPages": discovered, "characters": items,
            "pickerScope": "newly-found-original-series",
            "pickerCharacterIds": [item["id"] for item in items if item["id"] not in first_ids]}
    pending = DEST / "characters.json.tmp"
    pending.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    pending.replace(DEST / "characters.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/spongebob-import-cache"))
    parser.add_argument("--force", action="store_true", help="redownload existing portraits")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--audit-cache-dir", type=Path, default=Path("/tmp/spongebob-original-audit"))
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    args.audit_cache_dir.mkdir(parents=True, exist_ok=True)
    (DEST / "characters").mkdir(parents=True, exist_ok=True)
    all_pages = discover(args.cache_dir / "characters-category.json")
    episode_pages = category_pages("Episodes", args.audit_cache_dir / "episodes.json")
    source_texts = revision_texts(all_pages, args.audit_cache_dir, "revisions")
    episode_texts = revision_texts(episode_pages, args.audit_cache_dir, "episode-revisions")
    # Regular original-series episodes use this template. Livestreams, clip
    # compilations and separate short-form programs do not establish inclusion.
    episode_texts = {title: text for title, text in episode_texts.items() if re.search(r"\{\{Episode\s*(?:\n|\|)", text)}
    episodes = set(episode_texts)
    episode_index = episode_character_index(episode_texts)
    evidence = {page["title"]: series_evidence(page["title"], source_texts[page["title"]], episodes, episode_index) for page in all_pages}
    selected = [page for page in all_pages if is_candidate(page["title"], source_texts[page["title"]]) and evidence[page["title"]]]
    selected.sort(key=lambda p: (p["title"] not in MAIN, p["title"].casefold()))
    print(f"Selected {len(selected)} original-TV character pages from {len(all_pages)} indexed entries and {len(episodes)} episode sources", flush=True)
    image_pages = []
    for offset in range(0, len(selected), 50):
        batch = selected[offset:offset + 50]
        cache = args.cache_dir / ("images-" + str(offset) + ".json")
        if cache.exists():
            data = json.loads(cache.read_text())
            if set(data["query"]["pages"]) != {str(p["pageid"]) for p in batch}:
                data = None
        else:
            data = None
        if data is None:
            data = api({"action": "query", "prop": "pageimages|categories", "pageids": "|".join(str(p["pageid"]) for p in batch), "piprop": "original|name", "cllimit": 500})
            cache.write_text(json.dumps(data))
            time.sleep(.15)
        for page in data["query"]["pages"].values():
            page["seriesEpisode"], page["seriesEvidence"] = evidence[page["title"]]
            if page.get("original") and page.get("pageimage") != "TBA.png":
                image_pages.append(page)
            elif not page.get("original"):
                fallback = image_fallback(page)
                if fallback:
                    image_pages.append(fallback)
        print(f"Located portraits for {len(image_pages)} of {min(offset + 50, len(selected))} pages", flush=True)
    items, failures = [], []
    for page in image_pages:
        if page["title"] in MAIN:
            try:
                items.append(download(page, args.force))
            except Exception as error:
                failures.append({"title": page["title"], "error": str(error)})
    print(f"Main cast ready: {len(items)}", flush=True)
    others = [page for page in image_pages if page["title"] not in MAIN]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(download, page, args.force): page for page in others}
        for i, future in enumerate(as_completed(futures), 1):
            page = futures[future]
            try:
                items.append(future.result())
            except Exception as error:
                failures.append({"title": page["title"], "error": str(error)})
            if i % 50 == 0:
                print(f"Verified {len(items)} local portraits, {len(failures)} failures", flush=True)
    if len({item["id"] for item in items}) != len(items):
        raise RuntimeError("Duplicate character ID found")
    write_roster(items, len(all_pages))
    final_files = {Path(item["image"]).name for item in items}
    final_files.update(Path(item["fallbackImage"]).name for item in items if item.get("fallbackImage"))
    for stale in (DEST / "characters").iterdir():
        if stale.suffix in {".webp", ".png", ".jpg", ".jpeg"} and stale.name not in final_files:
            stale.unlink()
    (args.cache_dir / "failures.json").write_text(json.dumps(failures, indent=2))
    print(f"Complete: {len(items)} verified images; {len(failures)} failures", flush=True)


if __name__ == "__main__":
    main()
