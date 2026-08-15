/**
 * Minimal binary max-heap priority queue.
 * Items with a higher priority value are dequeued first.
 * When priorities tie, earlier-inserted items win (FIFO).
 */
export class PriorityQueue<T> {
  private readonly heap: { item: T; priority: number; seq: number }[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(item: T, priority: number): void {
    this.heap.push({ item, priority, seq: this.seq++ });
    this.siftUp(this.heap.length - 1);
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  /** Remove and return the highest-priority item, or undefined if empty. */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top.item;
  }

  clear(): void {
    this.heap.length = 0;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.greater(this.heap[i], this.heap[parent])) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let largest = i;
      if (left < n && this.greater(this.heap[left], this.heap[largest])) {
        largest = left;
      }
      if (right < n && this.greater(this.heap[right], this.heap[largest])) {
        largest = right;
      }
      if (largest === i) break;
      [this.heap[i], this.heap[largest]] = [this.heap[largest], this.heap[i]];
      i = largest;
    }
  }

  private greater(a: { priority: number; seq: number }, b: { priority: number; seq: number }): boolean {
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.seq < b.seq;
  }
}
