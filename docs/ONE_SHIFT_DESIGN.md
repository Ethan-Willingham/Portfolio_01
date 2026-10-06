# One Shift: making the warehouse into a business game

## Intended experience

The player should feel capable quickly, then feel the pleasure and pressure of
running a place that grows through their decisions. Stock on the racks, a real
customer, a moving worker, and money arriving make the premise tangible. Reading
receipts was taking attention away from the business. The new opening teaches
through one useful sale, then introduces restocking and expansion as needs appear.

This is a design hypothesis, not a claim that automated tests can establish fun.

## Research that changed the implementation

The MDA framework distinguishes programmed mechanics, behavior during play, and
the experience produced for the player. It argues for inspecting both directions
and tuning the resulting dynamics. For this game, the target experiences are
competence, planning under manageable pressure, and making the warehouse one's own.
A feature belongs only if it supports those experiences. The user interface and
profit model therefore changed together, rather than adding more tutorial copy.
[Hunicke, LeBlanc, and Zubek, MDA](https://www.cs.northwestern.edu/~hunicke/MDA.pdf).

Ryan, Rigby, and Przybylski's four studies associate perceived autonomy and
competence with enjoyment and willingness to play again, including the usefulness
of intuitive controls. That supports a clear first success and decisions with
visible consequences. It does not establish a universal recipe or prove this
particular game's appeal. Our application is to let players choose shipments,
stock size, timing, capacity, and labor while removing unnecessary receipt steps.
[The motivational pull of video games](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf).

Factorio's tutorial account argues that a player should learn an important concept,
rather than merely obey a prescribed sequence. It also describes limiting early
complexity while giving production a purpose. Here, the important concept is
inventory turning into revenue that funds more inventory. Starting with stock
lets the player experience that concept before procurement or paperwork.
[Friday Facts 284](https://www.factorio.com/blog/post/fff-284).

Factorio's later tutorial postmortem is a useful warning: an appealing introduction
can still misrepresent the main game, especially if its promised experience does
not continue. The first order here uses the same reservations, picking, wrapping,
truck loading, payment, and buying rules as later days. There is no separate fake
money tutorial or one-off mechanic that disappears after the opening.
[Friday Facts 342](https://www.factorio.com/blog/post/fff-342).

The robot task redesign describes reducing small hassles to leave room for deeper
systems, and selecting work using expected arrival time rather than idle proximity
alone. We adopted the first principle, not that exact scheduling algorithm.
Customer-level queues express intent; workers execute the detailed handling.
Collecting several lots into one shipment removes wasteful wrap/load repetitions.
[Friday Facts 374](https://www.factorio.com/blog/post/fff-374).

## Decisions that carry the game

| Decision | Reward | Constraint |
| --- | --- | --- |
| Which order comes first | Cash and product unlock progress | Deadline, available cases, worker time |
| Buy a small shipment | Fast stockout recovery | Higher unit cost and repeated freight |
| Buy bulk | Lower cost and fewer deliveries | More cash tied up, longer lead time, space |
| Add racks | Room for a broader range | Cash that could buy saleable inventory |
| Faster handling or picking | More useful work per shift | Capital cost and the actual bottleneck |
| Add a dock door | Receiving and shipping can overlap | Cost and wall space |
| Buy and train a forklift | Faster handling and upper racks | Cost and the training prerequisite |
| Hire someone | Parallel work | Recruiting and recurring wages |
| Sell surplus back | Cash and room immediately after handling | A loss on the purchased stock |

The forecast exposes enough demand to make purchasing a decision rather than a
blind guess. Rotating popular products, mixed orders, and later rush requests
change the day. A modest service effect changes future quotes without making a
single failure a financial cliff. Missed requests lose a sale; accepted partial
shipments lose part of the payout. Cancellation returns physical stock and
releases its claims. Paid supplies survive closing and arrive the next morning.

The early economy grants inventory once as starting capital. It does not grant
more each day. Cash comes from actual sales. Purchasing, freight, packaging,
rent, wages, interest, and power compete for that cash. Reporting both money on
hand and profit prevents inventory purchasing from looking like an immediate
operating loss, while charging sold-stock costs prevents revenue from looking
like profit. The supplier buyback is deliberately below cost, so it can repair
a bad purchasing decision without becoming an infinite income loop.

## Pacing and clarity

The first order is already visible. The clock waits for that first decision,
then normal time starts. The introductory day has longer deadlines and three
products. New products unlock after actual customer orders, not elapsed days.
Eight orders add radios; twenty add notebooks. Demand grows with demonstrated
throughput, capped at twelve requests per day. Fifty orders and $3,000 net worth
form a longer objective while allowing the same warehouse to continue afterward.

A shipment is one planning action. The detailed animation remains useful because
it shows where goods and labor are going. The queue can be prioritized and paused.
Customer trucks arrive after stock is prepared, freeing the dock for suppliers
while workers pick. A single shipment pallet collects several partial lots of the
same item, so fragmentation does not multiply wrapping and loading clicks or
silently trap the business in leftover pallets.

The beginning board stays below 65 words. It has a concrete goal, a product
quantity, a payout, and Ship order. Barcode and lot details are optional. Stock
prices, arrival estimates, space, and credit appear where a buying decision is
made. The growth shop only offers upgrades that change the current simulation.
The layout survives enlarged type and landscape phone dimensions with the same
controls; the first action remains visible and at least 44 pixels tall.

## What testing establishes

Native browser playtests exercise the opening, a mixed shipment, procurement,
receiving, the report, upgrading, and the next day through visible controls.
Simulation checks cover reservations, grouped collection, cash and physical
conservation, cancelled work, supplier returns, deadlines, full racks, paid
stock overnight, and saved games during actual motion. Automated business
policies use ordinary commands across 20 seeds, 24 days, and two strategies
(960 shifts). Buying ahead and reinvesting averaged 212 fulfilled orders and
$8,055 closing cash; reactive restocking without upgrades averaged 68 orders
and $1,786. All 20 planned runs reached the warehouse objective. This comparison
changes both purchasing and investment, so it does not isolate either effect.
It demonstrates reachable growth and consequential choices under these policies,
while exposing throughput failures, excess purchasing, and inaccessible growth.

The first balance runs found two real defects: a loading check was seeing stock
already promised to another order, and partial lots became separate shipment
pallets. Fixing those behaviors improved the game more than extra explanation
would have. Further tests found that inventory in transit disappeared from the
buying forecast and that a delivery receipt required all purchased pallets to
remain stored simultaneously. Those cases now preserve the pipeline and record
each actual receipt separately.

These checks do not answer whether the pressure feels good to a human, whether
players notice the forecast, or whether the later business needs more variety.
The next useful evidence is watching someone play cold: time to first shipment,
where they hesitate, whether they can explain cash versus profit, when they choose
an upgrade, and whether they want another day. That feedback can change prices,
frequency, capacities, or the foundations again.
