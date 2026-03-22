# ARC - JS - Adaptive Replacement Cache

This repository now contains a pure JavaScript example of the IBM Adaptive Replacement Cache (ARC) algorithm, plus a small browser demo that shows the cache evolving step by step.

ARC was introduced by researchers at IBM Almaden Research Center as a scan-resistant alternative to plain LRU caches. Instead of betting only on recency or only on frequency, ARC adapts between the two while the workload is running.

## What is in this repo

- `js/main.js` implements the cache in plain JavaScript.
- `index.html` renders a browser demo with a sample request trace.
- `css/main.css` styles the walkthrough page.

There is no build step. Open `index.html` directly in a browser to see the example.

## How ARC works

ARC keeps four LRU lists:

- `T1`: real cache entries seen recently, usually only once.
- `T2`: real cache entries seen often, meaning they were accessed again.
- `B1`: ghost entries for keys that were evicted from `T1`.
- `B2`: ghost entries for keys that were evicted from `T2`.

The ghost lists store keys only, not cached values. They act as memory for what the cache recently threw away.

ARC also tracks a tuning value named `p`:

- `p` is the target size for `T1`.
- When `B1` gets a hit, ARC increases `p`, giving more room to recent items.
- When `B2` gets a hit, ARC decreases `p`, giving more room to frequent items.

That one feedback loop is what makes ARC adaptive.

## Request lifecycle

For each requested key, the implementation follows the ARC paper closely:

1. If the key is already in `T1` or `T2`, it is a cache hit.
2. A hit in `T1` promotes the item into `T2`.
3. A hit in `T2` keeps the item in `T2` and refreshes its recency.
4. If the key is found in `B1`, ARC treats that as evidence that recency matters more, increases `p`, runs replacement, and restores the item into `T2`.
5. If the key is found in `B2`, ARC treats that as evidence that frequency matters more, decreases `p`, runs replacement, and restores the item into `T2`.
6. If the key is brand new, ARC inserts it into `T1` and may evict older entries according to the `replace()` rule.

## The `replace()` decision

When ARC needs space, it does not always evict from the same place:

- If `T1` is bigger than the current target `p`, ARC evicts from `T1` into `B1`.
- Otherwise it evicts from `T2` into `B2`.
- A `B2` hit makes eviction from `T1` more likely next time.
- A `B1` hit makes eviction from `T2` more likely next time.

This lets ARC shift between recency-heavy and frequency-heavy behavior without a fixed policy knob.

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
- `cache.access(key, value)` is the best method for simulating page requests. It records hits and misses and admits a missing value into the cache.
- `cache.get(key)` reads from the real cache only. It promotes hits but does not load misses.
- `cache.set(key, value)` inserts or updates an item using ARC admission rules without changing hit or miss counters.
- `cache.snapshot()` returns a plain object with `p`, hit statistics, and the contents of `T1`, `T2`, `B1`, and `B2`.

## Demo walkthrough

The browser page runs this request trace against a cache of size `4`:

```text
A B C D A B E A B C D E F A E F
```

For every request the demo shows:

- whether the access was a hit, a cold miss, or a ghost miss,
- the new value of `p`,
- the current contents of `T1`, `T2`, `B1`, and `B2`,
- and the action ARC took internally.

This makes it easier to see the difference between:

- items that are merely recent,
- items that become frequent,
- and items whose eviction teaches ARC how to rebalance itself.

## Design notes

This version favors clarity over optimization.

- The four ARC lists are modeled as plain JavaScript arrays so the state transitions stay easy to read.
- Real cache values live in a small `Map`, while the ghost lists keep keys only.
- That makes the implementation simpler to study, even though it is not tuned for large-scale performance.

## References

- Adaptive replacement cache
- IBM Almaden Research Center ARC paper and related notes
- LRU vs ARC comparisons and teaching material
