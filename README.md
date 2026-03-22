# ARC - JS - Adaptive Replacement Cache

This project is a plain JavaScript implementation of IBM's Adaptive Replacement Cache (ARC), plus a small browser demo that lets you inspect the cache state step by step.

ARC works by keeping two real LRU lists and two ghost-history lists. New items enter `T1`, which represents recency. If an item is requested again, it moves to `T2`, which represents frequency. When items are evicted from those real cache lists, ARC keeps their keys in `B1` and `B2` so it can remember what it threw away.

That history is what makes ARC adaptive. A hit in `B1` means the cache likely needs more room for recent items, so ARC increases `p`, the target size of `T1`. A hit in `B2` means frequent items need more protection, so ARC decreases `p`. The replacement step then uses `p` to decide whether the next eviction should come from `T1` or `T2`.

## In this repo

- `js/main.js` contains the readable ARC implementation and the demo logic.
- `index.html` renders the browser walkthrough.
- `css/main.css` styles the demo page.

There is no build step. Open `index.html` directly in a browser to run the example.

## ARC at a glance

ARC manages four LRU lists:

- `T1` - real cache entries seen recently, usually only once.
- `T2` - real cache entries that have been seen again and now count as frequent.
- `B1` - ghost entries for keys evicted from `T1`.
- `B2` - ghost entries for keys evicted from `T2`.

The ghost lists store keys only, not values. They are not part of the real cache; they are just memory.

ARC also maintains a tuning parameter named `p`:

- `p` is the target size for `T1`.
- larger `p` means ARC is leaning toward recency.
- smaller `p` means ARC is leaning toward frequency.

## What happens on each request

1. If the key is in `T1`, it is a hit and gets promoted to `T2`.
2. If the key is in `T2`, it is a hit and becomes most-recent in `T2`.
3. If the key is in `B1`, ARC increases `p`, runs replacement, and restores the key into `T2`.
4. If the key is in `B2`, ARC decreases `p`, runs replacement, and restores the key into `T2`.
5. If the key is brand new, ARC inserts it into `T1` and evicts something if needed.

## ASCII sequence diagram

```text
Client          ARC                  T1/T2                  B1/B2
  |              |                     |                      |
  | request(key) |                     |                      |
  |------------->|                     |                      |
  |              | check T1/T2         |                      |
  |              |-------------------->|                      |
  |              |<--------------------| hit?                 |
  |              |                     |                      |
  |              | if key in T1        | move key T1 -> T2    |
  |              |-------------------->|                      |
  |<-------------| return value        |                      |
  |              |                     |                      |
  |              | if key in T2        | refresh in T2        |
  |              |-------------------->|                      |
  |<-------------| return value        |                      |
  |              |                     |                      |
  |              | if miss in T1/T2    |                      |
  |              | check B1/B2         |--------------------->|
  |              |<-------------------------------------------| ghost hit?
  |              |                     |                      |
  |              | if key in B1        |                      | recency won
  |              | increase p          |                      |
  |              | replace()           | evict to B1 or B2    |
  |              |-------------------->|--------------------->|
  |              | move key into T2    |                      |
  |              |-------------------->|                      |
  |<-------------| return value        |                      |
  |              |                     |                      |
  |              | if key in B2        |                      | frequency won
  |              | decrease p          |                      |
  |              | replace()           | evict to B1 or B2    |
  |              |-------------------->|--------------------->|
  |              | move key into T2    |                      |
  |              |-------------------->|                      |
  |<-------------| return value        |                      |
  |              |                     |                      |
  |              | if brand-new key    | maybe replace()      |
  |              |-------------------->|--------------------->|
  |              | insert key into T1  |                      |
  |              |-------------------->|                      |
  |<-------------| return value        |                      |
```

Short version:

- `T1` hit -> promote to `T2`
- `T2` hit -> refresh in `T2`
- `B1` hit -> increase `p`
- `B2` hit -> decrease `p`
- cold miss -> insert into `T1`

## How replacement works

When ARC needs space, it does not always evict from the same list.

- If `T1` is larger than the current target `p`, ARC evicts from `T1` into `B1`.
- Otherwise, ARC evicts from `T2` into `B2`.

This is the key balancing rule. `p` tells ARC how much room to reserve for recent items, and the ghost hits keep moving that target up or down.

## JavaScript API

The main class is `AdaptiveReplacementCache`.

```js
const cache = new AdaptiveReplacementCache(4);

cache.access("A", { page: "A" });
cache.access("B", { page: "B" });
cache.access("A", { page: "A" });

console.log(cache.snapshot());
```

### Methods

- `new AdaptiveReplacementCache(capacity)` creates a cache with a fixed number of real slots.
- `cache.access(key, value)` simulates a request, records hits and misses, and admits missing values.
- `cache.get(key)` reads from the real cache only; hits are promoted, misses are not loaded.
- `cache.set(key, value)` inserts or updates an item using ARC admission rules without changing hit or miss counters.
- `cache.snapshot()` returns a plain object with `p`, hit statistics, and the contents of `T1`, `T2`, `B1`, and `B2`.

## Demo walkthrough

The browser demo runs this request trace against a cache of size `4`:

```text
A B C D A B E A B C D E F A E F
```

For each request, the demo shows:

- whether it was a hit, a cold miss, or a ghost miss,
- the current value of `p`,
- the current contents of `T1`, `T2`, `B1`, and `B2`,
- and the action ARC took internally.

That makes it easier to see the difference between items that are merely recent, items that become frequent, and evictions that teach ARC how to rebalance itself.

## Design notes

This version favors clarity over optimization.

- The four ARC lists are modeled as plain JavaScript arrays so the state transitions are easy to follow.
- Real cache values live in a small `Map`, while the ghost lists keep keys only.
- The goal is to make the algorithm readable, not to optimize for large workloads.

## References

- [Adaptive Replacement Cache in Python (Python recipe)](http://code.activestate.com/recipes/576532/)
- [Adaptive replacement cache](http://en.wikipedia.org/wiki/Adaptive_replacement_cache)
- [LRU vs ARC](http://u.cs.biu.ac.il/~wiseman/2os/2os/os2.pdf)
- [C ARC Implementation](https://github.com/wereHamster)
- [MurmurHash fast hashing](http://en.wikipedia.org/wiki/MurmurHash)
- [Optimized JavaScript implementation of MurmurHash](https://github.com/garycourt/murmurhash-js)
