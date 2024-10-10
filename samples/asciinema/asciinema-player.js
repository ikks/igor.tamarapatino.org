var AsciinemaPlayer = (function (exports) {
  'use strict';

  const sharedConfig = {};
  function setHydrateContext(context) {
    sharedConfig.context = context;
  }

  const equalFn = (a, b) => a === b;
  const $PROXY = Symbol("solid-proxy");
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let Listener = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
      owner = Owner,
      unowned = fn.length === 0,
      root = unowned ? UNOWNED : {
        owned: null,
        cleanups: null,
        context: null,
        owner: detachedOwner === undefined ? owner : detachedOwner
      },
      updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function batch(fn) {
    return runUpdates(fn, false);
  }
  function untrack(fn) {
    if (Listener === null) return fn();
    const listener = Listener;
    Listener = null;
    try {
      return fn();
    } finally {
      Listener = listener;
    }
  }
  function onMount(fn) {
    createEffect(() => untrack(fn));
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  function getListener() {
    return Listener;
  }
  function children(fn) {
    const children = createMemo(fn);
    const memo = createMemo(() => resolveChildren(children()));
    memo.toArray = () => {
      const c = memo();
      return Array.isArray(c) ? c : c != null ? [c] : [];
    };
    return memo;
  }
  function readSignal() {
    const runningTransition = Transition ;
    if (this.sources && (this.state || runningTransition )) {
      if (this.state === STALE || runningTransition ) updateComputation(this);else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) ;
            if (TransitionRunning && !o.tState || !TransitionRunning && !o.state) {
              if (o.pure) Updates.push(o);else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (TransitionRunning) ;else o.state = STALE;
          }
          if (Updates.length > 10e5) {
            Updates = [];
            if (false) ;
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const owner = Owner,
      listener = Listener,
      time = ExecCount;
    Listener = Owner = node;
    runComputation(node, node.value, time);
    Listener = listener;
    Owner = owner;
  }
  function runComputation(node, value, time) {
    let nextValue;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      handleError(err);
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    const runningTransition = Transition ;
    if (node.state === 0 || runningTransition ) return;
    if (node.state === PENDING || runningTransition ) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state || runningTransition ) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if (node.state === STALE || runningTransition ) {
        updateComputation(node);
      } else if (node.state === PENDING || runningTransition ) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait) Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
      userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    if (sharedConfig.context) setHydrateContext();
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition ;
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        if (source.state === STALE || runningTransition ) {
          if (source !== ignore) runTop(source);
        } else if (source.state === PENDING || runningTransition ) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition ;
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state || runningTransition ) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
          index = node.sourceSlots.pop(),
          obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
            s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
    node.context = null;
  }
  function castError(err) {
    if (err instanceof Error || typeof err === "string") return err;
    return new Error("Unknown error");
  }
  function handleError(err) {
    err = castError(err);
    throw err;
  }
  function resolveChildren(children) {
    if (typeof children === "function" && !children.length) return resolveChildren(children());
    if (Array.isArray(children)) {
      const results = [];
      for (let i = 0; i < children.length; i++) {
        const result = resolveChildren(children[i]);
        Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
      }
      return results;
    }
    return children;
  }

  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
      mapped = [],
      disposers = [],
      len = 0,
      indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
        i,
        j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
          newIndices,
          newIndicesNext,
          temp,
          tempdisposers,
          tempIndexes,
          start,
          end,
          newEnd,
          item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        }
        else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function indexArray(list, mapFn, options = {}) {
    let items = [],
      mapped = [],
      disposers = [],
      signals = [],
      len = 0,
      i;
    onCleanup(() => dispose(disposers));
    return () => {
      const newItems = list() || [];
      newItems[$TRACK];
      return untrack(() => {
        if (newItems.length === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            signals = [];
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
          return mapped;
        }
        if (items[0] === FALLBACK) {
          disposers[0]();
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
        }
        for (i = 0; i < newItems.length; i++) {
          if (i < items.length && items[i] !== newItems[i]) {
            signals[i](() => newItems[i]);
          } else if (i >= items.length) {
            mapped[i] = createRoot(mapper);
          }
        }
        for (; i < items.length; i++) {
          disposers[i]();
        }
        len = signals.length = disposers.length = newItems.length;
        items = newItems.slice(0);
        return mapped = mapped.slice(0, len);
      });
      function mapper(disposer) {
        disposers[i] = disposer;
        const [s, set] = createSignal(newItems[i]);
        signals[i] = set;
        return mapFn(s, i);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }
  function trueFn() {
    return true;
  }
  const propTraps = {
    get(_, property, receiver) {
      if (property === $PROXY) return receiver;
      return _.get(property);
    },
    has(_, property) {
      if (property === $PROXY) return true;
      return _.has(property);
    },
    set: trueFn,
    deleteProperty: trueFn,
    getOwnPropertyDescriptor(_, property) {
      return {
        configurable: true,
        enumerable: true,
        get() {
          return _.get(property);
        },
        set: trueFn,
        deleteProperty: trueFn
      };
    },
    ownKeys(_) {
      return _.keys();
    }
  };
  function resolveSource(s) {
    return !(s = typeof s === "function" ? s() : s) ? {} : s;
  }
  function mergeProps(...sources) {
    let proxy = false;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      proxy = proxy || !!s && $PROXY in s;
      sources[i] = typeof s === "function" ? (proxy = true, createMemo(s)) : s;
    }
    if (proxy) {
      return new Proxy({
        get(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            const v = resolveSource(sources[i])[property];
            if (v !== undefined) return v;
          }
        },
        has(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            if (property in resolveSource(sources[i])) return true;
          }
          return false;
        },
        keys() {
          const keys = [];
          for (let i = 0; i < sources.length; i++) keys.push(...Object.keys(resolveSource(sources[i])));
          return [...new Set(keys)];
        }
      }, propTraps);
    }
    const target = {};
    for (let i = sources.length - 1; i >= 0; i--) {
      if (sources[i]) {
        const descriptors = Object.getOwnPropertyDescriptors(sources[i]);
        for (const key in descriptors) {
          if (key in target) continue;
          Object.defineProperty(target, key, {
            enumerable: true,
            get() {
              for (let i = sources.length - 1; i >= 0; i--) {
                const v = (sources[i] || {})[key];
                if (v !== undefined) return v;
              }
            }
          });
        }
      }
    }
    return target;
  }

  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback || undefined));
  }
  function Index(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(indexArray(() => props.each, props.children, fallback || undefined));
  }
  function Show(props) {
    let strictEqual = false;
    const keyed = props.keyed;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => strictEqual ? a === b : !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        const fn = typeof child === "function" && child.length > 0;
        strictEqual = keyed || fn;
        return fn ? untrack(() => child(c)) : child;
      }
      return props.fallback;
    }, undefined, undefined);
  }
  function Switch(props) {
    let strictEqual = false;
    let keyed = false;
    const equals = (a, b) => a[0] === b[0] && (strictEqual ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2];
    const conditions = children(() => props.children),
      evalConditions = createMemo(() => {
        let conds = conditions();
        if (!Array.isArray(conds)) conds = [conds];
        for (let i = 0; i < conds.length; i++) {
          const c = conds[i].when;
          if (c) {
            keyed = !!conds[i].keyed;
            return [i, c, conds[i]];
          }
        }
        return [-1];
      }, undefined, {
        equals
      });
    return createMemo(() => {
      const [index, when, cond] = evalConditions();
      if (index < 0) return props.fallback;
      const c = cond.children;
      const fn = typeof c === "function" && c.length > 0;
      strictEqual = keyed || fn;
      return fn ? untrack(() => c(when)) : c;
    }, undefined, undefined);
  }
  function Match(props) {
    return props;
  }

  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
      aEnd = a.length,
      bEnd = bLength,
      aStart = 0,
      bStart = 0,
      after = a[aEnd - 1].nextSibling,
      map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
              sequence = 1,
              t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }

  const $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init, options = {}) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
    }, options.owner);
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, check, isSVG) {
    const t = document.createElement("template");
    t.innerHTML = html;
    let node = t.content.firstChild;
    if (isSVG) node = node.firstChild;
    return node;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler);
  }
  function style(node, value, prev) {
    if (!value) return prev ? setAttribute(node, "style") : value;
    const nodeStyle = node.style;
    if (typeof value === "string") return nodeStyle.cssText = value;
    typeof prev === "string" && (nodeStyle.cssText = prev = undefined);
    prev || (prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = e.composedPath && e.composedPath()[0] || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (sharedConfig.registry && !sharedConfig.done) {
      sharedConfig.done = true;
      document.querySelectorAll("[id^=pl-]").forEach(elem => {
        while (elem && elem.nodeType !== 8 && elem.nodeValue !== "pl-" + e) {
          let x = elem.nextSibling;
          elem.remove();
          elem = x;
        }
        elem && elem.remove();
      });
    }
    while (node) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node._$host || node.parentNode || node.host;
    }
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    if (sharedConfig.context && !current) current = [...parent.childNodes];
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
      multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (sharedConfig.context) return current;
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data = value;
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      if (sharedConfig.context) return current;
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (sharedConfig.context) {
        if (!array.length) return current;
        for (let i = 0; i < array.length; i++) {
          if (array[i].parentNode) return current = array;
        }
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value instanceof Node) {
      if (sharedConfig.context && value.parentNode) return current = multi ? [value] : value;
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
        prev = current && current[i];
      if (item instanceof Node) {
        normalized.push(item);
      } else if (item == null || item === true || item === false) ; else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if ((typeof item) === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) {
          normalized.push(prev);
        } else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker = null) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  let wasm;
  const heap = new Array(128).fill(undefined);
  heap.push(undefined, null, true, false);
  function getObject(idx) {
    return heap[idx];
  }
  let heap_next = heap.length;
  function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }
  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }
  const cachedTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', {
    ignoreBOM: true,
    fatal: true
  }) : {
    decode: () => {
      throw Error('TextDecoder not available');
    }
  };
  if (typeof TextDecoder !== 'undefined') {
    cachedTextDecoder.decode();
  }
  let cachedUint8Memory0 = null;
  function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
      cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
  }
  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
  }
  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }
  function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
      return `${val}`;
    }
    if (type == 'string') {
      return `"${val}"`;
    }
    if (type == 'symbol') {
      const description = val.description;
      if (description == null) {
        return 'Symbol';
      } else {
        return `Symbol(${description})`;
      }
    }
    if (type == 'function') {
      const name = val.name;
      if (typeof name == 'string' && name.length > 0) {
        return `Function(${name})`;
      } else {
        return 'Function';
      }
    }
    // objects
    if (Array.isArray(val)) {
      const length = val.length;
      let debug = '[';
      if (length > 0) {
        debug += debugString(val[0]);
      }
      for (let i = 1; i < length; i++) {
        debug += ', ' + debugString(val[i]);
      }
      debug += ']';
      return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
      className = builtInMatches[1];
    } else {
      // Failed to match the standard '[object ClassName]'
      return toString.call(val);
    }
    if (className == 'Object') {
      // we're a user defined class or Object
      // JSON.stringify avoids problems with cycles, and is generally much
      // easier than looping through ownProperties of `val`.
      try {
        return 'Object(' + JSON.stringify(val) + ')';
      } catch (_) {
        return 'Object';
      }
    }
    // errors
    if (val instanceof Error) {
      return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
  }
  let WASM_VECTOR_LEN = 0;
  const cachedTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : {
    encode: () => {
      throw Error('TextEncoder not available');
    }
  };
  const encodeString = typeof cachedTextEncoder.encodeInto === 'function' ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
  } : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr = malloc(buf.length, 1) >>> 0;
      getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8Memory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 0x7F) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
      const ret = encodeString(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  let cachedInt32Memory0 = null;
  function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
      cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
  }
  /**
  * @param {number} cols
  * @param {number} rows
  * @param {boolean} resizable
  * @param {number} scrollback_limit
  * @returns {VtWrapper}
  */
  function create$1(cols, rows, resizable, scrollback_limit) {
    const ret = wasm.create(cols, rows, resizable, scrollback_limit);
    return VtWrapper.__wrap(ret);
  }
  let cachedUint32Memory0 = null;
  function getUint32Memory0() {
    if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
      cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32Memory0;
  }
  function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32Memory0().subarray(ptr / 4, ptr / 4 + len);
  }
  const VtWrapperFinalization = typeof FinalizationRegistry === 'undefined' ? {
    register: () => {},
    unregister: () => {}
  } : new FinalizationRegistry(ptr => wasm.__wbg_vtwrapper_free(ptr >>> 0));
  /**
  */
  class VtWrapper {
    static __wrap(ptr) {
      ptr = ptr >>> 0;
      const obj = Object.create(VtWrapper.prototype);
      obj.__wbg_ptr = ptr;
      VtWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
      return obj;
    }
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      VtWrapperFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_vtwrapper_free(ptr);
    }
    /**
    * @param {string} s
    * @returns {any}
    */
    feed(s) {
      const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.vtwrapper_feed(this.__wbg_ptr, ptr0, len0);
      return takeObject(ret);
    }
    /**
    * @returns {string}
    */
    inspect() {
      let deferred1_0;
      let deferred1_1;
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.vtwrapper_inspect(retptr, this.__wbg_ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
      }
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.vtwrapper_get_size(retptr, this.__wbg_ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var v1 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4, 4);
        return v1;
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
    * @param {number} l
    * @returns {any}
    */
    get_line(l) {
      const ret = wasm.vtwrapper_get_line(this.__wbg_ptr, l);
      return takeObject(ret);
    }
    /**
    * @returns {any}
    */
    get_cursor() {
      const ret = wasm.vtwrapper_get_cursor(this.__wbg_ptr);
      return takeObject(ret);
    }
  }
  async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          if (module.headers.get('Content-Type') != 'application/wasm') {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module, imports);
      if (instance instanceof WebAssembly.Instance) {
        return {
          instance,
          module
        };
      } else {
        return instance;
      }
    }
  }
  function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_object_drop_ref = function (arg0) {
      takeObject(arg0);
    };
    imports.wbg.__wbindgen_error_new = function (arg0, arg1) {
      const ret = new Error(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_clone_ref = function (arg0) {
      const ret = getObject(arg0);
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_number_new = function (arg0) {
      const ret = arg0;
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_bigint_from_u64 = function (arg0) {
      const ret = BigInt.asUintN(64, arg0);
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
      const ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_f975102236d3c502 = function (arg0, arg1, arg2) {
      getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    };
    imports.wbg.__wbg_new_b525de17f44a8943 = function () {
      const ret = new Array();
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_f841cc6f2098f4b5 = function () {
      const ret = new Map();
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_f9876326328f45ed = function () {
      const ret = new Object();
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_string = function (arg0) {
      const ret = typeof getObject(arg0) === 'string';
      return ret;
    };
    imports.wbg.__wbg_set_17224bc548dd1d7b = function (arg0, arg1, arg2) {
      getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    };
    imports.wbg.__wbg_set_388c4c6422704173 = function (arg0, arg1, arg2) {
      const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_debug_string = function (arg0, arg1) {
      const ret = debugString(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len1;
      getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbindgen_throw = function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };
    return imports;
  }
  function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedInt32Memory0 = null;
    cachedUint32Memory0 = null;
    cachedUint8Memory0 = null;
    return wasm;
  }
  function initSync(module) {
    if (wasm !== undefined) return wasm;
    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
      module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
  }
  async function __wbg_init(input) {
    if (wasm !== undefined) return wasm;
    const imports = __wbg_get_imports();
    if (typeof input === 'string' || typeof Request === 'function' && input instanceof Request || typeof URL === 'function' && input instanceof URL) {
      input = fetch(input);
    }
    const {
      instance,
      module
    } = await __wbg_load(await input, imports);
    return __wbg_finalize_init(instance, module);
  }

  var exports$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    VtWrapper: VtWrapper,
    create: create$1,
    default: __wbg_init,
    initSync: initSync
  });

  const base64codes = [62,0,0,0,63,52,53,54,55,56,57,58,59,60,61,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,0,0,0,0,0,0,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51];

          function getBase64Code(charCode) {
              return base64codes[charCode - 43];
          }

          function base64_decode(str) {
              let missingOctets = str.endsWith("==") ? 2 : str.endsWith("=") ? 1 : 0;
              let n = str.length;
              let result = new Uint8Array(3 * (n / 4));
              let buffer;

              for (let i = 0, j = 0; i < n; i += 4, j += 3) {
                  buffer =
                      getBase64Code(str.charCodeAt(i)) << 18 |
                      getBase64Code(str.charCodeAt(i + 1)) << 12 |
                      getBase64Code(str.charCodeAt(i + 2)) << 6 |
                      getBase64Code(str.charCodeAt(i + 3));
                  result[j] = buffer >> 16;
                  result[j + 1] = (buffer >> 8) & 0xFF;
                  result[j + 2] = buffer & 0xFF;
              }

              return result.subarray(0, result.length - missingOctets);
          }

          const wasm_code = base64_decode("AGFzbQEAAAAB+wEdYAJ/fwF/YAN/f38Bf2ACf38AYAN/f38AYAF/AGAEf39/fwBgAX8Bf2AFf39/f38AYAV/f39/fwF/YAABf2AEf39/fwF/YAZ/f39/f38AYAAAYAF8AX9gAX4Bf2AHf39/f39/fwF/YAJ+fwF/YBV/f39/f39/f39/f39/f39/f39/f38Bf2ASf39/f39/f39/f39/f39/f39/AX9gD39/f39/f39/f39/f39/fwF/YAt/f39/f39/f39/fwF/YAN/f34AYAZ/f39/f38Bf2AFf399f38AYAR/fX9/AGAFf398f38AYAR/fH9/AGAFf39+f38AYAR/fn9/AALOAw8Dd2JnGl9fd2JpbmRnZW5fb2JqZWN0X2Ryb3BfcmVmAAQDd2JnFF9fd2JpbmRnZW5fZXJyb3JfbmV3AAADd2JnG19fd2JpbmRnZW5fb2JqZWN0X2Nsb25lX3JlZgAGA3diZxVfX3diaW5kZ2VuX251bWJlcl9uZXcADQN3YmcaX193YmluZGdlbl9iaWdpbnRfZnJvbV91NjQADgN3YmcVX193YmluZGdlbl9zdHJpbmdfbmV3AAADd2JnGl9fd2JnX3NldF9mOTc1MTAyMjM2ZDNjNTAyAAMDd2JnGl9fd2JnX25ld19iNTI1ZGUxN2Y0NGE4OTQzAAkDd2JnGl9fd2JnX25ld19mODQxY2M2ZjIwOThmNGI1AAkDd2JnGl9fd2JnX25ld19mOTg3NjMyNjMyOGY0NWVkAAkDd2JnFF9fd2JpbmRnZW5faXNfc3RyaW5nAAYDd2JnGl9fd2JnX3NldF8xNzIyNGJjNTQ4ZGQxZDdiAAMDd2JnGl9fd2JnX3NldF8zODhjNGM2NDIyNzA0MTczAAEDd2JnF19fd2JpbmRnZW5fZGVidWdfc3RyaW5nAAIDd2JnEF9fd2JpbmRnZW5fdGhyb3cAAgP4AfYBBgICAAMBCAQCAQABAgIAAg8CCAcAEAAAAgsCCwMCAQQCAwURAwUSAwcIEwkEAwMUAgUCAgQFBQMFBQAAAAADFQQFAAIAAwIHBwIBAgQABwUCCwIDAwMDAAACAAIDAAoFBQAAAwQHAAMDAAYAAAAAAAEGBAYFDAICAAAAAQACAQEBAAAEBAICAgMAAwMCBQgAAAAAAAoEAAAAAAAEAgIDBAIWAAAHCBcZGwQABQQEAAAAAQYDAgQEBAIAAAoFAwAEAQAAAAAAAgICAgAAAAADAwMGAAAEAAYAAAAABAQEAAAEAgwMAAACAAAAAAEAAQMBAAIDAgQABAUBcAF0dAUDAQARBgkBfwFBgIDAAAsH8wEMBm1lbW9yeQIAFF9fd2JnX3Z0d3JhcHBlcl9mcmVlAK4BBmNyZWF0ZQBtDnZ0d3JhcHBlcl9mZWVkAFkRdnR3cmFwcGVyX2luc3BlY3QAQRJ2dHdyYXBwZXJfZ2V0X3NpemUAUhJ2dHdyYXBwZXJfZ2V0X2xpbmUAfhR2dHdyYXBwZXJfZ2V0X2N1cnNvcgCAARFfX3diaW5kZ2VuX21hbGxvYwCRARJfX3diaW5kZ2VuX3JlYWxsb2MAowEfX193YmluZGdlbl9hZGRfdG9fc3RhY2tfcG9pbnRlcgDlAQ9fX3diaW5kZ2VuX2ZyZWUAzAEJ0wEBAEEBC3PiAaAB6AG5AZgBnwGJAYsBngF1oQHcAXyxAVFsyQHrAdEBoQF9cP8BzgFmvgF7eu0B6gGlAb8BZ+wBpgFp5wGIAaIByAGQAewBigEj8wHuAXEZxgGnAbIB5gGhAXjpAe8B0gHkAakBwQHAAboBswG0AWCzAbcBswG0AbYBtQGwAdQBxAGNASWAAtUBhAKBAoMClgGvAVxG4QFoxAGOASb0AdYB1wHZAYYB2AH1AbgBUyxCggLEAY8B+AH2AfcBzQHQAdoB2wH7ARqHAfkBCu+uBPYBqSQCCX8BfiMAQRBrIgkkAAJAAkACQAJAAkACQAJAIABB9QFPBEAgAEHN/3tPDQcgAEELaiIAQXhxIQRB3IPBACgCACIIRQ0EQQAgBGshAwJ/QQAgBEGAAkkNABpBHyAEQf///wdLDQAaIARBBiAAQQh2ZyIAa3ZBAXEgAEEBdGtBPmoLIgdBAnRBwIDBAGooAgAiAkUEQEEAIQAMAgtBACEAIARBAEEZIAdBAXZrIAdBH0YbdCEGA0ACQCACKAIEQXhxIgUgBEkNACAFIARrIgUgA08NACACIQEgBSIDDQBBACEDIAIhAAwECyACKAIUIgUgACAFIAIgBkEddkEEcWpBEGooAgAiAkcbIAAgBRshACAGQQF0IQYgAg0ACwwBC0HYg8EAKAIAIgZBECAAQQtqQfgDcSAAQQtJGyIEQQN2IgJ2IgFBA3EEQAJAIAFBf3NBAXEgAmoiAkEDdCIAQdCBwQBqIgEgAEHYgcEAaigCACIFKAIIIgBHBEAgACABNgIMIAEgADYCCAwBC0HYg8EAIAZBfiACd3E2AgALIAVBCGohAyAFIAJBA3QiAEEDcjYCBCAAIAVqIgAgACgCBEEBcjYCBAwHCyAEQeCDwQAoAgBNDQMCQAJAIAFFBEBB3IPBACgCACIARQ0GIABoQQJ0QcCAwQBqKAIAIgEoAgRBeHEgBGshAyABIQIDQAJAIAEoAhAiAA0AIAEoAhQiAA0AIAIoAhghBwJAAkAgAiACKAIMIgBGBEAgAkEUQRAgAigCFCIAG2ooAgAiAQ0BQQAhAAwCCyACKAIIIgEgADYCDCAAIAE2AggMAQsgAkEUaiACQRBqIAAbIQYDQCAGIQUgASIAKAIUIQEgAEEUaiAAQRBqIAEbIQYgAEEUQRAgARtqKAIAIgENAAsgBUEANgIACyAHRQ0EIAIgAigCHEECdEHAgMEAaiIBKAIARwRAIAdBEEEUIAcoAhAgAkYbaiAANgIAIABFDQUMBAsgASAANgIAIAANA0Hcg8EAQdyDwQAoAgBBfiACKAIcd3E2AgAMBAsgACgCBEF4cSAEayIBIANJIQYgASADIAYbIQMgACACIAYbIQIgACEBDAALAAsCQEECIAJ0IgBBACAAa3IgASACdHFoIgJBA3QiAEHQgcEAaiIBIABB2IHBAGooAgAiAygCCCIARwRAIAAgATYCDCABIAA2AggMAQtB2IPBACAGQX4gAndxNgIACyADIARBA3I2AgQgAyAEaiIGIAJBA3QiACAEayIFQQFyNgIEIAAgA2ogBTYCAEHgg8EAKAIAIgAEQCAAQXhxQdCBwQBqIQFB6IPBACgCACEHAn9B2IPBACgCACICQQEgAEEDdnQiAHFFBEBB2IPBACAAIAJyNgIAIAEMAQsgASgCCAshACABIAc2AgggACAHNgIMIAcgATYCDCAHIAA2AggLIANBCGohA0Hog8EAIAY2AgBB4IPBACAFNgIADAgLIAAgBzYCGCACKAIQIgEEQCAAIAE2AhAgASAANgIYCyACKAIUIgFFDQAgACABNgIUIAEgADYCGAsCQAJAIANBEE8EQCACIARBA3I2AgQgAiAEaiIFIANBAXI2AgQgAyAFaiADNgIAQeCDwQAoAgAiAEUNASAAQXhxQdCBwQBqIQFB6IPBACgCACEHAn9B2IPBACgCACIGQQEgAEEDdnQiAHFFBEBB2IPBACAAIAZyNgIAIAEMAQsgASgCCAshACABIAc2AgggACAHNgIMIAcgATYCDCAHIAA2AggMAQsgAiADIARqIgBBA3I2AgQgACACaiIAIAAoAgRBAXI2AgQMAQtB6IPBACAFNgIAQeCDwQAgAzYCAAsgAkEIaiEDDAYLIAAgAXJFBEBBACEBQQIgB3QiAEEAIABrciAIcSIARQ0DIABoQQJ0QcCAwQBqKAIAIQALIABFDQELA0AgASAAIAEgACgCBEF4cSIBIARrIgUgA0kiBhsgASAESSICGyEBIAMgBSADIAYbIAIbIQMgACgCECICBH8gAgUgACgCFAsiAA0ACwsgAUUNAEHgg8EAKAIAIgAgBE8gAyAAIARrT3ENACABKAIYIQcCQAJAIAEgASgCDCIARgRAIAFBFEEQIAEoAhQiABtqKAIAIgINAUEAIQAMAgsgASgCCCICIAA2AgwgACACNgIIDAELIAFBFGogAUEQaiAAGyEGA0AgBiEFIAIiACgCFCECIABBFGogAEEQaiACGyEGIABBFEEQIAIbaigCACICDQALIAVBADYCAAsgB0UNAiABIAEoAhxBAnRBwIDBAGoiAigCAEcEQCAHQRBBFCAHKAIQIAFGG2ogADYCACAARQ0DDAILIAIgADYCACAADQFB3IPBAEHcg8EAKAIAQX4gASgCHHdxNgIADAILAkACQAJAAkACQEHgg8EAKAIAIgIgBEkEQEHkg8EAKAIAIgAgBE0EQCAEQa+ABGpBgIB8cSIAQRB2QAAhAiAJQQRqIgFBADYCCCABQQAgAEGAgHxxIAJBf0YiABs2AgQgAUEAIAJBEHQgABs2AgAgCSgCBCIIRQRAQQAhAwwKCyAJKAIMIQVB8IPBACAJKAIIIgdB8IPBACgCAGoiATYCAEH0g8EAQfSDwQAoAgAiACABIAAgAUsbNgIAAkACQEHsg8EAKAIAIgMEQEHAgcEAIQADQCAIIAAoAgAiASAAKAIEIgJqRg0CIAAoAggiAA0ACwwCC0H8g8EAKAIAIgBBAEcgACAITXFFBEBB/IPBACAINgIAC0GAhMEAQf8fNgIAQcyBwQAgBTYCAEHEgcEAIAc2AgBBwIHBACAINgIAQdyBwQBB0IHBADYCAEHkgcEAQdiBwQA2AgBB2IHBAEHQgcEANgIAQeyBwQBB4IHBADYCAEHggcEAQdiBwQA2AgBB9IHBAEHogcEANgIAQeiBwQBB4IHBADYCAEH8gcEAQfCBwQA2AgBB8IHBAEHogcEANgIAQYSCwQBB+IHBADYCAEH4gcEAQfCBwQA2AgBBjILBAEGAgsEANgIAQYCCwQBB+IHBADYCAEGUgsEAQYiCwQA2AgBBiILBAEGAgsEANgIAQZyCwQBBkILBADYCAEGQgsEAQYiCwQA2AgBBmILBAEGQgsEANgIAQaSCwQBBmILBADYCAEGggsEAQZiCwQA2AgBBrILBAEGggsEANgIAQaiCwQBBoILBADYCAEG0gsEAQaiCwQA2AgBBsILBAEGogsEANgIAQbyCwQBBsILBADYCAEG4gsEAQbCCwQA2AgBBxILBAEG4gsEANgIAQcCCwQBBuILBADYCAEHMgsEAQcCCwQA2AgBByILBAEHAgsEANgIAQdSCwQBByILBADYCAEHQgsEAQciCwQA2AgBB3ILBAEHQgsEANgIAQeSCwQBB2ILBADYCAEHYgsEAQdCCwQA2AgBB7ILBAEHggsEANgIAQeCCwQBB2ILBADYCAEH0gsEAQeiCwQA2AgBB6ILBAEHggsEANgIAQfyCwQBB8ILBADYCAEHwgsEAQeiCwQA2AgBBhIPBAEH4gsEANgIAQfiCwQBB8ILBADYCAEGMg8EAQYCDwQA2AgBBgIPBAEH4gsEANgIAQZSDwQBBiIPBADYCAEGIg8EAQYCDwQA2AgBBnIPBAEGQg8EANgIAQZCDwQBBiIPBADYCAEGkg8EAQZiDwQA2AgBBmIPBAEGQg8EANgIAQayDwQBBoIPBADYCAEGgg8EAQZiDwQA2AgBBtIPBAEGog8EANgIAQaiDwQBBoIPBADYCAEG8g8EAQbCDwQA2AgBBsIPBAEGog8EANgIAQcSDwQBBuIPBADYCAEG4g8EAQbCDwQA2AgBBzIPBAEHAg8EANgIAQcCDwQBBuIPBADYCAEHUg8EAQciDwQA2AgBByIPBAEHAg8EANgIAQeyDwQAgCEEPakF4cSIAQQhrIgI2AgBB0IPBAEHIg8EANgIAQeSDwQAgB0EoayIBIAggAGtqQQhqIgA2AgAgAiAAQQFyNgIEIAEgCGpBKDYCBEH4g8EAQYCAgAE2AgAMCAsgAyAITw0AIAEgA0sNACAAKAIMIgFBAXENACABQQF2IAVGDQMLQfyDwQBB/IPBACgCACIAIAggACAISRs2AgAgByAIaiECQcCBwQAhAAJAAkADQCACIAAoAgBHBEAgACgCCCIADQEMAgsLIAAoAgwiAUEBcQ0AIAFBAXYgBUYNAQtBwIHBACEAA0ACQCAAKAIAIgEgA00EQCABIAAoAgRqIgYgA0sNAQsgACgCCCEADAELC0Hsg8EAIAhBD2pBeHEiAEEIayICNgIAQeSDwQAgB0EoayIBIAggAGtqQQhqIgA2AgAgAiAAQQFyNgIEIAEgCGpBKDYCBEH4g8EAQYCAgAE2AgAgAyAGQSBrQXhxQQhrIgAgACADQRBqSRsiAUEbNgIEQcCBwQApAgAhCiABQRBqQciBwQApAgA3AgAgASAKNwIIQcyBwQAgBTYCAEHEgcEAIAc2AgBBwIHBACAINgIAQciBwQAgAUEIajYCACABQRxqIQADQCAAQQc2AgAgBiAAQQRqIgBLDQALIAEgA0YNByABIAEoAgRBfnE2AgQgAyABIANrIgBBAXI2AgQgASAANgIAIABBgAJPBEAgAyAAECcMCAsgAEF4cUHQgcEAaiEBAn9B2IPBACgCACICQQEgAEEDdnQiAHFFBEBB2IPBACAAIAJyNgIAIAEMAQsgASgCCAshACABIAM2AgggACADNgIMIAMgATYCDCADIAA2AggMBwsgACAINgIAIAAgACgCBCAHajYCBCAIQQ9qQXhxQQhrIgYgBEEDcjYCBCACQQ9qQXhxQQhrIgMgBCAGaiIFayEEIANB7IPBACgCAEYNAyADQeiDwQAoAgBGDQQgAygCBCIBQQNxQQFGBEAgAyABQXhxIgAQICAAIARqIQQgACADaiIDKAIEIQELIAMgAUF+cTYCBCAFIARBAXI2AgQgBCAFaiAENgIAIARBgAJPBEAgBSAEECcMBgsgBEF4cUHQgcEAaiEBAn9B2IPBACgCACICQQEgBEEDdnQiAHFFBEBB2IPBACAAIAJyNgIAIAEMAQsgASgCCAshACABIAU2AgggACAFNgIMIAUgATYCDCAFIAA2AggMBQtB5IPBACAAIARrIgE2AgBB7IPBAEHsg8EAKAIAIgIgBGoiADYCACAAIAFBAXI2AgQgAiAEQQNyNgIEIAJBCGohAwwIC0Hog8EAKAIAIQYCQCACIARrIgFBD00EQEHog8EAQQA2AgBB4IPBAEEANgIAIAYgAkEDcjYCBCACIAZqIgAgACgCBEEBcjYCBAwBC0Hgg8EAIAE2AgBB6IPBACAEIAZqIgA2AgAgACABQQFyNgIEIAIgBmogATYCACAGIARBA3I2AgQLIAZBCGohAwwHCyAAIAIgB2o2AgRB7IPBAEHsg8EAKAIAIgZBD2pBeHEiAEEIayICNgIAQeSDwQBB5IPBACgCACAHaiIBIAYgAGtqQQhqIgA2AgAgAiAAQQFyNgIEIAEgBmpBKDYCBEH4g8EAQYCAgAE2AgAMAwtB7IPBACAFNgIAQeSDwQBB5IPBACgCACAEaiIANgIAIAUgAEEBcjYCBAwBC0Hog8EAIAU2AgBB4IPBAEHgg8EAKAIAIARqIgA2AgAgBSAAQQFyNgIEIAAgBWogADYCAAsgBkEIaiEDDAMLQQAhA0Hkg8EAKAIAIgAgBE0NAkHkg8EAIAAgBGsiATYCAEHsg8EAQeyDwQAoAgAiAiAEaiIANgIAIAAgAUEBcjYCBCACIARBA3I2AgQgAkEIaiEDDAILIAAgBzYCGCABKAIQIgIEQCAAIAI2AhAgAiAANgIYCyABKAIUIgJFDQAgACACNgIUIAIgADYCGAsCQCADQRBPBEAgASAEQQNyNgIEIAEgBGoiBSADQQFyNgIEIAMgBWogAzYCACADQYACTwRAIAUgAxAnDAILIANBeHFB0IHBAGohAgJ/QdiDwQAoAgAiBkEBIANBA3Z0IgBxRQRAQdiDwQAgACAGcjYCACACDAELIAIoAggLIQAgAiAFNgIIIAAgBTYCDCAFIAI2AgwgBSAANgIIDAELIAEgAyAEaiIAQQNyNgIEIAAgAWoiACAAKAIEQQFyNgIECyABQQhqIQMLIAlBEGokACADC+8WAQZ/IwBBIGsiBiQAAkACQCABKAIERQ0AIAEoAgAhAgNAAkAgBkEYaiACEIwBIAYoAhghAgJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAGKAIcQQFrDgYAIgMiAQIiCwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCACLwEAIgIOHgABAgMEBQ4GDgcODg4ODg4ODg4ODggICQoLDgwODQ4LIAEoAgQiAkUNESAAQQA6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAw3CyABKAIEIgJFDREgAEEBOgAAIAEgAkEBazYCBCABIAEoAgBBEGo2AgAMNgsgASgCBCICRQ0RIABBAjoAACABIAJBAWs2AgQgASABKAIAQRBqNgIADDULIAEoAgQiAkUNESAAQQM6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAw0CyABKAIEIgJFDREgAEEEOgAAIAEgAkEBazYCBCABIAEoAgBBEGo2AgAMMwsgASgCBCICRQ0RIABBBToAACABIAJBAWs2AgQgASABKAIAQRBqNgIADDILIAEoAgQiAkUNESAAQQY6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAwxCyABKAIEIgJFDREgAEEHOgAAIAEgAkEBazYCBCABIAEoAgBBEGo2AgAMMAsgASgCBCICRQ0RIABBCDoAACABIAJBAWs2AgQgASABKAIAQRBqNgIADC8LIAEoAgQiAkUNESAAQQk6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAwuCyABKAIEIgJFDREgAEEKOgAAIAEgAkEBazYCBCABIAEoAgBBEGo2AgAMLQsgASgCBCICRQ0RIABBCzoAACABIAJBAWs2AgQgASABKAIAQRBqNgIADCwLIAEoAgQiAkUNESAAQQw6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAwrCyABKAIEIgJFDREgAEENOgAAIAEgAkEBazYCBCABIAEoAgBBEGo2AgAMKgsCQAJAAkACQCACQR5rQf//A3FBCE8EQCACQSZrDgIBAgQLIAEoAgQiA0UNFSAAQQ47AAAgASADQQFrNgIEIAAgAkEeazoAAiABIAEoAgBBEGo2AgAMLQsgASgCBCICQQJPBEAgBkEQaiABKAIAQRBqEIwBIAYoAhAiAg0CIAEoAgQhAgsgAkUNFiACQQFrIQMgASgCAEEQaiECDCgLIAEoAgQiAkUNFCAAQQ86AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAwrCwJAAkACQCAGKAIUQQFHDQAgAi8BAEECaw4EAQAAAgALIAEoAgQiAkUNFyACQQFrIQMgASgCAEEQaiECDCgLIAEoAgAhAiABKAIEIgNBBU8EQCAAQQ46AAAgAkEkai0AACEEIAJBNGovAQAhBSACQcQAai8BACEHIAEgA0EFazYCBCABIAJB0ABqNgIAIAAgBCAFQQh0QYD+A3EgB0EQdHJyQQh0QQFyNgABDCwLIANBAU0NFyACQSBqIQIgA0ECayEDDCcLIAEoAgAhAiABKAIEIgNBA08EQCAAQQ47AAAgAkEkai0AACEEIAEgA0EDazYCBCABIAJBMGo2AgAgACAEOgACDCsLIANBAkYNJ0ECIANBwJvAABBiAAsCQAJAAkACQCACQfj/A3FBKEcEQCACQTBrDgIBAgQLIAEoAgQiA0UNGiAAQRA7AAAgASADQQFrNgIEIAAgAkEoazoAAiABIAEoAgBBEGo2AgAMLQsgASgCBCICQQJPBEAgBkEIaiABKAIAQRBqEIwBIAYoAggiAg0CIAEoAgQhAgsgAkUNGyACQQFrIQMgASgCAEEQaiECDCgLIAEoAgQiAkUNGSAAQRE6AAAgASACQQFrNgIEIAEgASgCAEEQajYCAAwrCwJAAkACQCAGKAIMQQFHDQAgAi8BAEECaw4EAQAAAgALIAEoAgQiAkUNHCACQQFrIQMgASgCAEEQaiECDCgLIAEoAgAhAiABKAIEIgNBBU8EQCAAQRA6AAAgAkEkai0AACEEIAJBNGovAQAhBSACQcQAai8BACEHIAEgA0EFazYCBCABIAJB0ABqNgIAIAAgBCAFQQh0QYD+A3EgB0EQdHJyQQh0QQFyNgABDCwLIANBAU0NHCACQSBqIQIgA0ECayEDDCcLIAEoAgAhAiABKAIEIgNBA08EQCAAQRA7AAAgAkEkai0AACEEIAEgA0EDazYCBCABIAJBMGo2AgAgACAEOgACDCsLIANBAkYNJ0ECIANBkJzAABBiAAsgAkHaAGtB//8DcUEITwRAIAJB5ABrQf//A3FBCE8NIiABKAIEIgNFDR0gAEEQOwAAIAEgA0EBazYCBCAAIAJB3ABrOgACIAEgASgCAEEQajYCAAwqCyABKAIEIgNFDRsgAEEOOwAAIAEgA0EBazYCBCAAIAJB0gBrOgACIAEgASgCAEEQajYCAAwpCyACLwEAIgNBMEcEQCADQSZHDSFBAiEDIAIvAQJBAkcNIUEEIQRBAyEFDB8LQQIhAyACLwECQQJHDSBBBCEEQQMhBQwdCyACLwEAIgNBMEcEQCADQSZHDSAgAi8BAkECRw0gQQUhBEEEIQVBAyEDDB4LIAIvAQJBAkcNH0EFIQRBBCEFQQMhAwwcCyACLwEAIgNBMEYNHSADQSZHDR4gAi8BAkEFRw0eIAEoAgQiA0UNGiACLQAEIQIgASADQQFrNgIEIAAgAjoAAiAAQQ47AAAgASABKAIAQRBqNgIADCYLQQFBAEHAmcAAEGIAC0EBQQBB0JnAABBiAAtBAUEAQeCZwAAQYgALQQFBAEHwmcAAEGIAC0EBQQBBgJrAABBiAAtBAUEAQZCawAAQYgALQQFBAEGgmsAAEGIAC0EBQQBBsJrAABBiAAtBAUEAQcCawAAQYgALQQFBAEHQmsAAEGIAC0EBQQBB4JrAABBiAAtBAUEAQfCawAAQYgALQQFBAEGAm8AAEGIAC0EBQQBBkJvAABBiAAtBAUEAQfCcwAAQYgALQQFBAEHgm8AAEGIAC0EBQQBBoJvAABBiAAtBAUEAQdCbwAAQYgALQQIgA0Gwm8AAEGIAC0EBQQBB4JzAABBiAAtBAUEAQbCcwAAQYgALQQFBAEHwm8AAEGIAC0EBQQBBoJzAABBiAAtBAiADQYCcwAAQYgALQQFBAEHQnMAAEGIAC0EBQQBBwJzAABBiAAtBAUEAQaCdwAAQYgALIAEoAgQiBwRAIAIgA0EBdGotAAAhAyACIAVBAXRqLwEAIQUgAiAEQQF0ai8BACECIAEgB0EBazYCBCABIAEoAgBBEGo2AgAgAEEQOgAAIAAgAyAFQQh0QYD+A3EgAkEQdHJyQQh0QQFyNgABDAsLQQFBAEGQncAAEGIACyABKAIEIgcEQCABIAdBAWs2AgQgASABKAIAQRBqNgIAIAIgA0EBdGotAAAhASACIAVBAXRqLwEAIQMgAiAEQQF0ai8BACECIABBDjoAACAAIAEgA0EIdEGA/gNxIAJBEHRyckEIdEEBcjYAAQwKC0EBQQBBgJ3AABBiAAsgAi8BAkEFRg0BCyABKAIEIgJFDQEgAkEBayEDIAEoAgBBEGohAgwDCyABKAIEIgNFDQEgAi0ABCECIAEgA0EBazYCBCAAIAI6AAIgAEEQOwAAIAEgASgCAEEQajYCAAwGC0EBQQBBwJ3AABBiAAtBAUEAQbCdwAAQYgALIAEgAzYCBCABIAI2AgAgAw0BDAILCyABQQA2AgQgASACQSBqNgIACyAAQRI6AAALIAZBIGokAAusDQIKfwN+IwBB0ABrIgMkACABKQIgIQwgAUGAgICAeDYCICADQSBqIgRBGGoiAiABQThqKQIANwMAIARBEGoiByABQTBqKQIANwMAIARBCGoiBCABQShqKQIANwMAIAMgDDcDIAJAAkAgDKdBgICAgHhHBEAgACADKQMgNwIAIABBGGogAikDADcCACAAQRBqIAcpAwA3AgAgAEEIaiAEKQMANwIADAELIANBIGoQxQEgASgCQCICIAEoAkRHBEAgAUEgaiEJIAFBFGohCANAIAEgAkEQajYCQAJAAkACQAJ/AkAgAigCACIHQf8ATwRAIAdBoAFJDQEgB0EGdkH/AHEgB0ENdkGArMAAai0AAEEHdHIiBEH/EksNAyAHQQJ2QQ9xIARBgK7AAGotAABBBHRyIgRB4B1PDQRBASAEQYDBwABqLQAAIAdBAXRBBnF2QQNxIgQgBEEDRhshBAwFC0EBIAdBH0sNARoLQQALIQQMAgsgBEGAE0GMpsAAEGMACyAEQeAdQZymwAAQYwALIAEgASgCSCIHIARqNgJIAkACQAJAAkACQAJAAkACQCAEQQFLDQAgAigCACIFQfz//wBxQbDBA0YNACAFQeD//wBxQYDLAEYNACAFQYD//wBxQYDKAEYNACAFQYD+/wBxQYDQAEYNACABKAIAIgtBgICAgHhGDQEgCC0AACEGIAItAAQiCkECRg0DIAZBAkYNAyAGIApHDQYgCg0CIAItAAUgAS0AFUcNBgwEC0Hx/8AALQAAGkEEQQQQ0wEiCEUNCiAIIAIoAgA2AgAgA0EUaiIFQQE2AgggBSAINgIEIAVBATYCACADQRBqIgggAkEMai8BADsBACADIAIpAgQ3AwggA0EgaiICQRhqIgUgAUEYaikCADcDACACQRBqIgYgAUEQaikCADcDACACQQhqIgIgAUEIaikCADcDACABKQIAIQwgAUGAgICAeDYCACADIAw3AyAgDKdBgICAgHhGDQQgACADKQMgNwIAIABBGGogBSkDADcCACAAQRBqIAYpAwA3AgAgAEEIaiACKQMANwIAIAkQxQEgASAENgIwIAEgBzYCLCAJQQhqIANBHGooAgA2AgAgCSADKQIUNwIAIAEgAykD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QAJAIAIoAhAiCkUEQCACKAIMIgBFDQEgAigCCCEBIABBA3QhBSAAQQFrQf////8BcUEBaiEHIAIoAgAhAANAIABBBGooAgAiBARAIAMoAiAgACgCACAEIAMoAiQoAgwRAQANBAsgASgCACADQQxqIAEoAgQRAAANAyABQQhqIQEgAEEIaiEAIAVBCGsiBQ0ACwwBCyACKAIUIgBFDQAgAEEFdCELIABBAWtB////P3FBAWohByACKAIIIQggAigCACEAA0AgAEEEaigCACIBBEAgAygCICAAKAIAIAEgAygCJCgCDBEBAA0DCyADIAUgCmoiAUEQaigCADYCHCADIAFBHGotAAA6ACwgAyABQRhqKAIANgIoIAFBDGooAgAhBEEAIQlBACEGAkACQAJAIAFBCGooAgBBAWsOAgACAQsgCCAEQQN0aiIMKAIEDQEgDCgCACEEC0EBIQYLIAMgBDYCECADIAY2AgwgAUEEaigCACEEAkACQAJAIAEoAgBBAWsOAgACAQsgCCAEQQN0aiIGKAIEDQEgBigCACEEC0EBIQkLIAMgBDYCGCADIAk2AhQgCCABQRRqKAIAQQN0aiIBKAIAIANBDGogASgCBBEAAA0CIABBCGohACALIAVBIGoiBUcNAAsLIAcgAigCBE8NASADKAIgIAIoAgAgB0EDdGoiACgCACAAKAIEIAMoAiQoAgwRAQBFDQELQQEMAQtBAAsgA0EwaiQAC+4GAQV/IwBB0AFrIgIkACAAKAIAIQMgAkEMaiIAQbwBakG4hMAANgIAIAJBwAFqQaSFwAA2AgAgAEGsAWpB7IbAADYCACAAQaQBakHchsAANgIAIABBnAFqQdyGwAA2AgAgAkGgAWpBmITAADYCACACQZgBakGYhMAANgIAIAJBkAFqQaSFwAA2AgAgAkGIAWpBzIbAADYCACAAQfQAakGkhcAANgIAIAJB+ABqQaSFwAA2AgAgAkHwAGpBpIXAADYCACAAQdwAakGkhcAANgIAIAJB4ABqQbyGwAA2AgAgAkHYAGpBmITAADYCACACQdAAakGshsAANgIAIAJByABqQZSFwAA2AgAgAkFAa0GchsAANgIAIAJBOGpBjIbAADYCACAAQSRqQfyFwAA2AgAgAkEoakHshcAANgIAIAJBIGpB7IXAADYCACACQRhqQZiEwAA2AgAgAiADQcMBajYCvAEgAiADQdwAajYCtAEgAiADQYgBajYCrAEgAiADQfQAajYCpAEgAiADQawBajYCnAEgAiADQagBajYClAEgAiADQcIBajYCjAEgAiADQcEBajYChAEgAiADQcABajYCfCACIANBvwFqNgJ0IAIgA0G+AWo2AmwgAiADQb0BajYCZCACIANB0ABqNgJcIAIgA0GkAWo2AlQgAiADQbABajYCTCACIANBsgFqNgJEIAIgA0HoAGo2AjwgAiADQcgAajYCNCACIANBvAFqNgIsIAIgA0EkajYCJCACIAM2AhwgAiADQaABajYCFCACQZiEwAA2AhAgAiADQZwBajYCDCACIANBxAFqNgLMASACIAJBzAFqNgLEAUEYIQZByIjAACEEIwBBIGsiAyQAIANBGDYCACADQRg2AgQgASgCFEGIisAAQQggASgCGCgCDBEBACEFIANBADoADSADIAU6AAwgAyABNgIIAn8DQCADQQhqIAQoAgAgBEEEaigCACAAQfTqwAAQISEFIABBCGohACAEQQhqIQQgBkEBayIGDQALIAMtAAwhASABQQBHIAMtAA1FDQAaQQEgAQ0AGiAFKAIAIgAtABxBBHFFBEAgACgCFEHH6MAAQQIgACgCGCgCDBEBAAwBCyAAKAIUQcbowABBASAAKAIYKAIMEQEACyADQSBqJAAgAkHQAWokAAuRBAELfyABQQFrIQ0gACgCBCEKIAAoAgAhCyAAKAIIIQwDQAJAAkAgAiAESQ0AA0AgASAEaiEFAkACQAJAIAIgBGsiB0EHTQRAIAIgBEcNASACIQQMBQsCQCAFQQNqQXxxIgYgBWsiAwRAQQAhAANAIAAgBWotAABBCkYNBSADIABBAWoiAEcNAAsgB0EIayIAIANPDQEMAwsgB0EIayEACwNAIAZBBGooAgAiCUGKlKjQAHNBgYKECGsgCUF/c3EgBigCACIJQYqUqNAAc0GBgoQIayAJQX9zcXJBgIGChHhxDQIgBkEIaiEGIAAgA0EIaiIDTw0ACwwBC0EAIQADQCAAIAVqLQAAQQpGDQIgByAAQQFqIgBHDQALIAIhBAwDCyADIAdGBEAgAiEEDAMLA0AgAyAFai0AAEEKRgRAIAMhAAwCCyAHIANBAWoiA0cNAAsgAiEEDAILIAAgBGoiBkEBaiEEAkAgAiAG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wJjAABBkAAtBwJjAABCkAQALIABBBGohASAAIAJBBHRqQQRqIQMDQAJAIAEoAgAiAkF/RwRAIAJBBkkNASACQQFqQQZB0J3AABBkAAtB0J3AABCkAQALIAFBBGpBACACQQF0QQJqEPwBGiABQQA2AgAgAyABQRBqIgFHDQALIABBgIDEADYCACAAQQA2AoQEC5oBAQF/IAAiBAJ/AkACfwJAAkAgAQRAIAJBAEgNASADKAIEBEAgAygCCCIABEAgAygCACAAIAEgAhDKAQwFCwsgAkUNAkHx/8AALQAAGiACIAEQ0wEMAwsgBEEANgIEDAMLIARBADYCBAwCCyABCyIABEAgBCACNgIIIAQgADYCBEEADAILIAQgAjYCCCAEIAE2AgQLQQELNgIAC5sBAQF/AkACQCABBEAgAkEASA0BAn8gAygCBARAAkAgAygCCCIERQRADAELIAMoAgAgBCABIAIQygEMAgsLIAEgAkUNABpB8f/AAC0AABogAiABENMBCyIDBEAgACACNgIIIAAgAzYCBCAAQQA2AgAPCyAAIAI2AgggACABNgIEDAILIABBADYCBAwBCyAAQQA2AgQLIABBATYCAAu5AQEEfwJAAkAgAkUEQCABKAIAIQMgASgCBCEFDAELIAEoAgQhBSABKAIAIQQDQCAEIAVGDQIgASAEQRBqIgM2AgAgBCgCACIGBEAgBkGAgICAeEYNAyAEKAIEIAZBBHRBBBDdAQsgAyEEIAJBAWsiAg0ACwsgAyAFRgRAIABBgICAgHg2AgAPCyABIANBEGo2AgAgACADKQIANwIAIABBCGogA0EIaikCADcCAA8LIABBgICAgHg2AgALgwMBBH8jAEEwayIEJAAgACgCGCEFIARBLGogA0EIai8AADsBACAEQSA2AiAgBCADKQAANwIkIARBEGogBEEgaiAFEE0gBEEAOgAcIARBCGogABCVAQJAIAEgAk0EQCAEKAIMIgAgAkkNASAEKAIIIAFBBHRqIQAgBEEQaiEDIwBBEGsiBSQAAkAgAiABayICRQRAIAMoAgAiAEUNASADKAIEIABBBHRBBBDdAQwBCyAAIAJBAWsiBkEEdGohASAGBEAgAkEEdEEQayECIAMtAAwhBgNAIAUgAxBaIAUgBjoADCAAKAIAIgcEQCAAKAIEIAdBBHRBBBDdAQsgACAFKQIANwIAIABBCGogBUEIaikCADcCACAAQRBqIQAgAkEQayICDQALCyABKAIAIgAEQCABKAIEIABBBHRBBBDdAQsgASADKQIANwIAIAFBCGogA0EIaikCADcCAAsgBUEQaiQAIARBMGokAA8LIAEgAkGMo8AAEGUACyACIABBjKPAABBkAAvFAQECfwJAAkAgACgCCCIFIAFPBEAgACgCBCABQQR0aiEAIAUgAWsiBCACSQRAQaynwABBIUHQp8AAEJcBAAsgBCACayIEIAAgBEEEdGogAhATIAEgAmoiBCACSQ0BIAQgBUsNAiACBEAgAkEEdCECA0AgACADKQIANwIAIABBCGogA0EIaikCADcCACAAQRBqIQAgAkEQayICDQALCw8LIAEgBUGUq8AAEGIACyABIARBpKvAABBlAAsgBCAFQaSrwAAQZAALjQEBA38jAEGAAWsiBCQAIAAoAgAhAANAIAIgBGpB/wBqIABBD3EiA0EwciADQdcAaiADQQpJGzoAACACQQFrIQIgAEEQSSAAQQR2IQBFDQALIAJBgAFqIgBBgQFPBEAgAEGAAUHs6MAAEGIACyABQfzowABBAiACIARqQYABakEAIAJrEBUgBEGAAWokAAuVAQEDfyMAQYABayIEJAAgAC0AACECQQAhAANAIAAgBGpB/wBqIAJBD3EiA0EwciADQTdqIANBCkkbOgAAIABBAWshACACQf8BcSIDQQR2IQIgA0EQTw0ACyAAQYABaiICQYEBTwRAIAJBgAFB7OjAABBiAAsgAUH86MAAQQIgACAEakGAAWpBACAAaxAVIARBgAFqJAALlgEBA38jAEGAAWsiBCQAIAAtAAAhAkEAIQADQCAAIARqQf8AaiACQQ9xIgNBMHIgA0HXAGogA0EKSRs6AAAgAEEBayEAIAJB/wFxIgNBBHYhAiADQRBPDQALIABBgAFqIgJBgQFPBEAgAkGAAUHs6MAAEGIACyABQfzowABBAiAAIARqQYABakEAIABrEBUgBEGAAWokAAuMAQEDfyMAQYABayIEJAAgACgCACEAA0AgAiAEakH/AGogAEEPcSIDQTByIANBN2ogA0EKSRs6AAAgAkEBayECIABBEEkgAEEEdiEARQ0ACyACQYABaiIAQYEBTwRAIABBgAFB7OjAABBiAAsgAUH86MAAQQIgAiAE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SBs2AmwMMAsgA0EAOgDCASADQQA2AmgMLwsCQAJAAkACQCAFLQABQQFrDgIBAgALIAMoAmgiAUUNAiABIAMoApwBTw0CIANB0ABqIAEQVQwCCyADQdAAaiADKAJoEFgMAQsgA0EANgJYCwwuCyAFLwECIQEgAy0AwgEhAiADQQA6AMIBIANBACADKAJoIAFBASABQQFLGyIBQX9zQQAgAWsgAhtqIgIgAygCnAEiAUEBayABIAJLGyACQQBIGzYCaAwtCyAFLwECIQQgA0EAOgDCASADIAMoAmgiAiADKAKcAUEBayIBIAEgAksbNgJoIAMgAygCoAFBAWsgAygCrAEiASABIAMoAmwiAUkbIgIgASAEQQEgBEEBSxtqIgEgASACSxs2AmwMLAsgA0EAOgDCASADQQAgAygCaCAFLwECIgFBASABQQFLG2oiAiADKAKcASIBQQFrIAEgAksbIAJBAEgbNgJoDCsLIAUvAQIhBiAFLwEEIQEgA0EAOgDCASADIAFBASABQQFLG0EBayICIAMoApwBIgFBAWsiBCABIAJLGyIBIAQgASAESRs2AmggAyADKAKoAUEAIAMtAL4BIgQbIgIgBkEBIAZBAUsbakEBayIBIAIgASACSxsiAiADKAKsASADKAKgAUEBayAEGyIBIAEgAksbNgJsDCoLIANBADoAwgEgAyADKAJoIgIgAygCnAFBAWsiASABIAJLGzYCaCADQQAgAygCqAEiASABIAMoAmwiAUsbIgIgASAFLwECIgFBASABQQFLG2siASABIAJIGzYCbAwpCyAFLwECIQQgAygCaCIBIAMoApwBIgJPBEAgA0EAOgDCASADIAJBAWsiATYCaAsgBEEBIARBAUsbIgQgAygCGCABayICIAIgBEsbIQYgA0GyAWohCgJAAkAgAyADKAJsIgJB7KDAABB/IgUoAggiDSABTwRAIAUoAgQiBCABQQR0aiANIAFrIAYQrQEgDSAGayEBIAYgDUsNASAGBEAgBCANQQR0aiEGIAQgAUEEdGohASAKQQhqIQQDQCABQSA2AgAgASAKKQAANwAEIAFBDGogBC8AADsAACAGIAFBEGoiAUcNAAsLDAILIAEgDUG0q8AAEGIACyABIA1BxKvAABBiAAsgBUEAOgAMIAIgAygCZCIBTw0pIAMoAmAgAmpBAToAAAwo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AAtDAQF/IAIgACgCACAAKAIIIgNrSwRAIAAgAyACEJkBIAAoAgghAwsgACgCBCADaiABIAIQ/gEaIAAgAiADajYCCEEAC0IBAX8gAiAAKAIAIAAoAggiA2tLBEAgACADIAIQPCAAKAIIIQMLIAAoAgQgA2ogASACEP4BGiAAIAIgA2o2AghBAAtCAQF/IAIgACgCACAAKAIIIgNrSwRAIAAgAyACED0gACgCCCEDCyAAKAIEIANqIAEgAhD+ARogACACIANqNgIIQQALSQEBfyMAQRBrIgIkACACIAA2AgwgAUGwjcAAQQJBso3AAEEGIABByAFqQZCNwABBuI3AAEEIIAJBDGpBoI3AABA+IAJBEGokAAs5AAJAIAFpQQFHDQBBgICAgHggAWsgAEkNACAABEBB8f/AAC0AABogACABENMBIgFFDQELIAEPCwALQAEBfyMAQRBrIgEkACABQQhqIAAgACgCAEEBEDQgASgCCCIAQYGAgIB4RwRAIAAgASgCDBDHAQALIAFBEGokAAs+AQF/IwBBEGsiASQAIAFBCGogACAAKAIAEDAgASgCCCIAQYGAgIB4RwRAIAAgASgCDBDHAQALIAFBEGokAAtAAQN/IAEoAhQiAiABKAIcIgNrIQQgAiADSQRAIAQgAkHsosAAEGIACyAAIAM2AgQgACABKAIQIARBBHRqNgIAC0ABA38gASgCFCICIAEoAhwiA2shBCACIANJBEAgBCACQfyiwAAQYgALIAAgAzYCBCAAIAEoAhAgBEEEdGo2AgALRAEBfyABKAIAIgIgASgCBEYEQCAAQYCAgIB4NgIADwsgASACQRBqNgIAIAAgAikCADcCACAAQQhqIAJBCGopAgA3AgALQgEBfyMAQSBrIgMkACADQQA2AhAgA0EBNgIEIANCBDcCCCADIAE2AhwgAyAANgIYIAMgA0EYajYCACADIAIQhQEAC/UBAQJ/IwBBEGsiAyQAIAMgACgCACIAQQRqNgIMIwBBEGsiAiQAIAIgASgCFEG4g8AAQQQgASgCGCgCDBEBADoADCACIAE2AgggAkEAOgANIAJBADYCBCACQQRqIABBmIPAABAtIANBDGpBqIPAABAtIQACfyACLQAMIgFBAEcgACgCACIARQ0AGkEBIAENABogAigCCCEBAkAgAEEBRw0AIAItAA1FDQAg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CyABIBl6p0EDdiACaiAIcSIAaiwAACICQQBOBEAgASABKQMAQoCBgoSIkKDAgH+DeqdBA3YiAGotAAAhAgsgACABaiAGQRl2IgY6AAAgASAAQQhrIAhxakEIaiAGOgAAIAMgAygCCCACQQFxazYCCCADIAMoAgxBAWo2AgwgASAAQXRsaiIBQQxrIgAgCykCADcCACAAQQhqIAtBCGooAgA2AgALIAFBBGsoAgAQAiEAIBAgECgCAEEBajYCACAKQTBqJAAMAgtBtJLAAEHGACAKQS9qQaSSwABBzJPAABBXAAsjAEEwayIAJAAgAEEBNgIMIABB9OXAADYCCCAAQgE3AhQgACAAQS9qrUKAgICAwA2ENwMgIAAgAEEgajYCECAAQQhqQZyVwAAQhQEACyATQRBqJAAgAAvGAQECfyMAQRBrIgAkACABKAIUQaDgwABBCyABKAIYKAIMEQEAIQMgAEEIaiICQQA6AAUgAiADOgAEIAIgATYCACACIgEtAAQhAwJAIAItAAVFBEAgA0EARyEBDAELQQEhAiADRQRAIAEoAgAiAi0AHEEEcUUEQCABIAIoAhRBx+jAAEECIAIoAhgoAgwRAQAiAToABAwCCyACKAIUQcbowABBASACKAIYKAIMEQEAIQILIAEgAjoABCACIQELIABBEGokACABCzIBAX8gAEEQahAuAkAgACgCACIBQYCAgIB4Rg0AIAFFDQAgACgCBCABQQR0QQQQ3QELCy8BAn8gACAAKAKoASICIAAoAqwBQQFqIgMgASAAQbIBahBWIABB3ABqIAIgAxB3Cy8BAn8gACAAKAKoASICIAAoAqwBQQFqIgMgASAAQbIBahAiIABB3ABqIAIgAxB3CysAIAEgAkkEQEGspsAAQSNBnKfAABCXAQALIAIgACACQQR0aiABIAJrEBMLqgEBBH8jAEHgBWsiAiQAIAJBDGohASMAQeAFayIDJAACQAJAIAAEQCAAKAIADQEgAEEANgIAIANBCGoiBCAAQdgFEP4BGiABIARBBGpB1AUQ/gEaIABB2AVBBBDdASADQeAFaiQADAILEPEBAAsQ8gEACyABQQxqIgAQgQEgABC8ASABQTBqIgAQgQEgABC8ASABQdAAahC7ASABQdwAahDEASACQeAFaiQACyUAIABBATYCBCAAIAEoAgQgASgCAGtBBHYiATYCCCAAIAE2AgALJQAgAEUEQEGslcAAQTIQ8AEACyAAIAIgAyAEIAUgASgCEBEIAAswACABKAIUIAAtAABBAnQiAEHIi8AAaigCACAAQbyLwABqKAIAIAEoAhgoAgwRAQALMAAgASgCFCAALQAAQQJ0IgBBiJHAAGooAgAgAEHQkMAAaigCACABKAIYKAIMEQEACyMAIABFBEBBrJXAAEEyEPABAAsgACACIAMgBCABKAIQEQUACyMAIABFBEBBrJXAAEEyEPABAAsgACACIAMgBCABKAIQEQoACyMAIABFBEBBrJXAAEEyEPABAAsgACACIAMgBCABKAIQERgACyMAIABFBEBBrJXAAEEyEPABAAsgACACIAMgBCABKAIQERoACyMAIABFBEBBrJXAAEEyEPABAAsgACACIAMgBCABKAIQERwACygBAX8gACgCACIBQYCAgIB4ckGAgICAeEcEQCAAKAIEIAFBARDdAQsLLgAgASgCFEGKhcAAQYWFwAAgACgCAC0AACIAG0EHQQUgABsgASgCGCgCDBEBAAshACAARQRAQayVwABBMhDwAQALIAAgAiADIAEoAhARAwALHQEBfyAAKAIAIgEEQCAAKAIEIAFBAnRBBBDdAQsLHQEBfyAAKAIAIgEEQCAAKAIEIAFBBHRBBBDdAQsLIgAgAC0AAEUEQCABQYTrwABBBRAUDwsgAUGJ68AAQQQQFAsrACABKAIUQZeKwABBkIrAACAALQAAIgAbQQlBByAAGyABKAIYKAIMEQEACysAIAEoAhRBoIrAAEH2hMAAIAAtAAAiABtBC0EGIAAbIAEoAhgoAgwRAQALHwAgAEUEQEGslcAAQTIQ8AEACyAAIAIgASgCEBEAAAutAwIDfgZ/QfT/wAAoAgBFBEAjAEEwayIGJAAgBkEQaiAABH8gACgCACEFIABBADYCACAAKAIEQQAgBRshBCAAQQhqQeiTwAAgBRsFQeiTwAALIgBBCGopAgAiAjcDACAGIAApAgAiAzcDCCAGQRhqIgBBEGpBhIDBACkCADcDACAAQQhqIgBB/P/AACkCADcDAEH0/8AAKQIAIQFB+P/AACAENgIAQfT/wABBATYCAEH8/8AAIAM3AgBBhIDBACACNwIAIAYgATcDGCABpwRAAkAgACgCBCIHRQ0AIAAoAgwiCARAIAAo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DxAAWAAAAMsAAAANAAAA5A8QAFgAAAD1AAAAKwAAAOQPEABYAAAAOgEAACwAAADkDxAAWAAAADMBAAAbAAAA5A8QAFgAAABGAQAAFAAAAOQPEABYAAAAWAEAABgAAADkDxAAWAAAAF0BAAAYAAAAYXNzZXJ0aW9uIGZhaWxlZDogbGluZXMuaXRlcigpLmFsbCh8bHwgbC5sZW4oKSA9PSBjb2xzKQDkDxAAWAAAAMwBAAAFAEHso8AAC/UHAQAAAE0AAABOAAAATwAAAFAAAABRAAAAFAAAAAQAAABSAAAAUwAAAFQAAABVAAAAL2hvbWUvaWdvci8uY2FyZ28vcmVnaXN0cnkvc3JjL2luZGV4LmNyYXRlcy5pby02ZjE3ZDIyYmJhMTUwMDFmL2F2dC0wLjEzLjAvc3JjL3Rlcm1pbmFsLnJzAAAcEhAAWgAAAFoCAAAVAAAAHBIQAFoAAACOAgAADgAAABwSEABaAAAA1AMAACMAAAAvaG9tZS9pZ29yLy5jYXJnby9yZWdpc3RyeS9zcmMvaW5kZXguY3JhdGVzLmlvLTZmMTdkMjJiYmExNTAwMWYvdW5pY29kZS13aWR0aC0wLjEuMTMvc3JjL3RhYmxlcy5ycwAAqBIQAGIAAAAnAAAAGQAAAKgSEABiAAAALQAAAB0AAABhc3NlcnRpb24gZmFpbGVkOiBtaWQgPD0gc2VsZi5sZW4oKS9ydXN0Yy9lZWI5MGNkYTE5NjkzODNmNTZhMjYzN2NiZDMwMzdiZGY1OTg4NDFjL2xpYnJhcnkvY29yZS9zcmMvc2xpY2UvbW9kLnJzTxMQAE0AAAB4DQAACQAAAGFzc2VydGlvbiBmYWlsZWQ6IGsgPD0gc2VsZi5sZW4oKQAAAE8TEABNAAAAow0AAAkAAAAvaG9tZS9pZ29yLy5jYXJnby9yZWdpc3RyeS9zcmMvaW5kZXguY3JhdGVzLmlvLTZmMTdkMjJiYmExNTAwMWYvYXZ0LTAuMTMuMC9zcmMvdGVybWluYWwvZGlydHlfbGluZXMucnMAAOATEABmAAAADAAAAA8AAADgExAAZgAAABAAAAAPAAAAYXNzZXJ0aW9uIGZhaWxlZDogbWlkIDw9IHNlbGYubGVuKCkvcnVzdGMvZWViOTBjZGExOTY5MzgzZjU2YTI2MzdjYmQzMDM3YmRm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MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzPhBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBABBgL/AAAvAAlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVe1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVd11Vx//Vd/1VVVVVV1VVVVVVVVVXVVVVV1f1dV1VVVVVVVVVVVVVVAEHcwcAACylVVVVVVdVVVVVVVVVVVVVVVVVVVRUAUFVVVVVVVVVVVVVVVVVVVVVVAQBBj8LAAAu0ARBBEFVVVVVVVVVVVVVVVVVVVVFVVQAAQFRVVVVVVVVVVVVVFQAAAAAAVVVVVVRVVVVVVVVVVQUAFAAUBFBVVVVVVVVVFVFVVVVVVVVVAAAAAAAAQFVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFAABUVVVVVVVVVVVVVVVVVRUAAFVVUVVVVVVVBRAAAAEBUFVVVVVVVVVVVVUBVVVVVVVVVVVVVVVVVVBVAABVVVVVVVVVVVVVBQBB0MPAAAvjDUBVVVVVVVVVVVVVVVVVRVQBAFRRAQBVVQVVVVVVVVVVUVVVVVVVVVVVVVVVVVVVRAFUVVFVFVVVBVVVVVVVVUVBVVVVVVVVVVVVVVVVVVVUQRUUUFFVVVVVVVVVUFFVVQEQVFFVVVVVBVVVVVVVBQBRVVVVVVVVVVVVVVVVVVUEAVRVUVUBVVUFVVVVVVVVVUVVVVVVVVVVVVVVVVVVVUVUVVVRVRVVVVVVVVVVVVVVVFRVVVVVVVVVVVVVVVVVBFQFBFBVQVVVBVVVVVVVVVVRVVVVVVVVVVVVVVVVVVUURAUEUFVBVVUFVVVVVVVVVVBVVVVVVVVVVVVVVVVVFUQBVFVRVRVVVQVVVVVVVVVVUVVVVVVVVVVVVVVVVVVVVVVVRRUFRFUVVVVVVVVVVVVVVVVVVVVVVVVVVVVRAEBVVRUAQFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEAAFRVVQBAVVVVVVVVVVVVVVVVVVVVVVVVUFVVVVVVVRFRVVVVVVVVVVVVVVVVVQEAAEAABFUBAAABAAAAAAAAAABUVUVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAQQAQUFVVVVVVVVQBVRVVVUBVFVVRUFVUVVVVVFVVVVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgAAAAAAAAAAVVVVVVVVVQFVVVVVVVVVVVVVVVUFVFVVVVVVVQVVVVVVVVVVBVVVVVVVVVUFVVVVVVVVVVVVVVVVVVVVVRAAUFVFAQAAVVVRVVVVVVVVVVVVVRUAVVVVVVVVVVVVVVVVVUFVVVVVVVVVVVFVVVVVVVVVVVVVVVVVQBVUVUVVAVVVVVVVVRUUVVVVVVVVVVVVVVVVVVVFAEBEAQBUFQAAFFVVVVVVVVVVVVVVVQAAAAAAAABAVVVVVVVVVVVVVVVVAFVVVVVVVVVVVVVVVQAAUAVVVVVVVVVVVVUVAABVVVVQVVVVVVVVVQVQEFBVVVVVVVVVVVVVVVVVRVARUFVVVVVVVVVVVVVVVVVVAAAFVVVVVVVVQAAAAAQAVFFVVFBVVVUVANd/X19//wVA913VdVVVVVVVVVVVAAAAAFVXVVX9V1VVVVVVVVVVVVdVVVVVVVVVVQAAAAAAAAAAVFVVVdVdXVXVdVVVfVVVVVVVVVVVVVVV1VfVf////1X//19VVVVdVf///1VVVVV1VVVfVVVVVfV1V1VVVdVVVVVVVVX319/XXV11/df//3dV/1VfXVVfV3VVVVV///X1X1VVVfX/X1VVXV1VVV1VVVVVVdVVVVVVdVWlVVVVaVVVVVVVVVVVVVVVVVVVValWllVVVVVVVVVVVVVV/////////////////////////////////////////////9///////////1X///////////9VVVX/////9V9VVd//X1X19VVfX/XX9V9VVVX1X1XVVVVVaVV9XfVVWlV3VVVVVVVVVVV3VaqqqlVVVd/ff99VVVWVVVVVVZVVVfVZVaVVVVVV6VX6/+///v//31Xv/6/77/tVWaVVVVVVVVVVVlVVVVVdVVVVZpWaVVVVVVVVVfX//1VVVVVVqVVVVVVVVVZVVZVVVVVVVVWVVlVVVVVVVVVVVVVVVVb5X1VVVVVVVVVVVVVVVVVVVVVVVVVVFVBVVVVVVVVVVVVVVVVVVVVVVVUVVVVVVVVVVVUAAAAAAAAAAKqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqVVVVqqqqqqpaVVVVVVVVqqqqqqqqqqqqqqqqqqoKAKqqqmqpqqqqqqqqqqqqqqqqqqqqqqqqqqpqgaqqqqqqqqqqqlWpqqqqqqqqqqqqqqmqqqqqqqqqqqqqqqqoqqqqqqqqqqqqaqqqqqqqqqqqqqqqqqqqqqqqqqqqqlVVlaqqqqqqqqqqqqqqaqqqqqqqqqqqqqr//6qqqqqqqqqqqqqqqqqqqlaqqqqqqqqqqqqqqqqqalVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUVQAAAUFVVVVVVVVUFVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVVRUUVVVVVVVVVQVVUVVVVVVVQVVVVVVVVAAAAAFBVRRVVVVVVVVVVVVUFAFBVVVVVVRUAAFBVVVWqqqqqqqqqVkBVVVVVVVVVVVVVVRUFUFBVVVVVVVVVVVVRVVVVVVVVVVVVVVVVVVVVVQFAQUFVVRVVVVRVVVVVVVVVVVVVVVRVVVVVVVVVVVVVVVUEFFQFUVVVVVVVVVVVVVVQVUVVVVVVVVVVVVVVVVFUUVVVVVWqqqqqqqqqqqpVVVUAAAAAAEAVAEG/0cAAC6EIVVVVVVVVVVVFVVVVVVVVVVUAAAAAqqpaVQAAAACqqqqqqqqqqmqqqqqqaqpVVVVVVaqqqqqqqqqqVlVVVVVVVVVVVVVVVVVVBVRVVVVVVVVVVVVVVVVVVVWqalVVAABUXVVVVVVVVVVVVVVVVVVVVVFVVVVVVVVVVVRVVVVVVVVVVVVVVVVVVVVVVVVVVQVAVQFBVQBVVVVVVVVVVVVVQBVVVVVVVVVVVVVBVVVVVVVVVVVVVVVVVVVVAFVVVVVVVVVVVVVVVVVVVVUVVFVVVVVVVVVVVVVVVVVVVVVVVVUBVQUAAFRVVVVVVVVVVVVVVQVQVVVVVVVVVVVVVVVVVVVRVVVVVVVVVVVVVVVVVQAAAEBVVVVVVVVVVVVVFFRVFVBVVVVVVVVVVVVVVRVAQVVFVVVVVVVVVVVVVVVVVVVVQFVVVVVVVVVVFQABAFRVVVVVVVVVVVVVVVVVVRVVVVVQVVVVVVVVVVVVVVVVBQBAVVUBFFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVFVAEVUVVVVVVVVVVFRUAQFVVVVVVVFVVVVUVVVVVBQBUAFRVVVVVVVVVVVVVVVVVVVVVAAAFRFVVVVVVRVVVVVVVVVVVVVVVVVVVVVVVVVVVFABEEQRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRUFUFUQVFVVVVVVVVBVVVVVVVVVVVVVVVVVVVVVVVVVVRUAQBFUVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRVRABBVVVVVVVVVVVUBBRAAVVVVVVVVVVVVVVVVVVVVVRUAAEFVVVVVVVVVVVVVVVVVVFUVRBVVVVVVVVVVVVVVVVVVVVVVVVVVVQAFVVRVVVVVVVVVAQBAVVVVVVVVVVVVFQAUQFUVVVUBQAFVVVVVVVVVVVVVVQUAAEBQVVVVVVVVVVVVVVVVVVVVVVVVVVVVAEAAEFVVVVUFAAAAAAAFAARBVVVVVVVVVVVVVVVVVVUBQEUQABBVVVVVVVVVVVVVVVVVVVVVVVVQEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUVVFVVUFVVVVVVVVVVVVVVVQVAVURVVVVVVVVVVVVVVVVVVVVUFQAAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAFRVVVVVVVVVVVVVVVVVVQBAVVVVVVUVVVVVVVVVVVVVVVVVVVVVFUBVVVVVVVVVVVVVVVVVVVVVVVVVqlRVVVpVVVWqqqqqqqqqqqqqqqqqqlVVqqqqqqpaVVVVVVVVVVVVVaqqVlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWqqappqqqqqqqqqqpqVVVVZVVVVVVVVVVqWVVVVapVVaqqqqqqqqqqqqqqqqqqqqqqqqpVVVVVVVVVVUEAVVVVVVVVVQBB69nAAAtFUAAAAAAAQFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEVAFAAAAAEABAFVVVVVVVVUFUFVVVVUFVFVVVVVVVVVVVVVVVVVVAEG92sAACwJAFQBBy9rAAAvaCFRVUVVVVVRVVVVVFQABAAAAVVVVVQBAAAAAABQAEARAVVVVVVVVVVVVVVVVVVVVVUVVVVVVVVVVVVVVVVVVVVUAVVVVVVVVVVUAQFVVVVVVVVVVVVVVAEBVVVVVVVVVVVVVVVVVVVZVVVVVVVVVVVVVVVVVVVVVVZVVVVVVVVVVVVVVVVX//39V/////////1///////////////////19V/////////++rqur/////V1VVVVVqVVVVqqqqqqqqqqqqqqpVqqpWVVpVVVWqWlVVVVVVVaqqqqqqqqqqVlVVqaqaqqqqqqqqqqqqqqqqqqqqqqqmqqqqqqpVVVWqqqqqqqqqqqqqapWqVVVVqqqqqlZWqqqqqqqqqqqqqqqqqqqqqqpqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpaqqqqqqqqqqqqqqqqqqqpaVVWVaqqqqqqqqlVVVVVlVVVVVVVVaVVVVVZVVVVVVVVVVVVVVVVVVVVVVVVVVZWqqqqqqlVVVVVVVVVVVVVVVapaVVZqqVWqVVWVVlWqqlZVVVVVVVVVVaqqqlVWVVVVVVVVqqqqqqqqqqqqqqpqqqqaqqqqqqqqqqqqqqqqqqpVVVVVVVVVVVVVVVWqqqpWqqpWVaqqqqqqqqqqqqqqmqpaVaWqqqpVqqpWVaqqVlX///////////////////9fWAAAAAwAAAAEAAAAWQAAAFoAAABbAAAAL3J1c3QvZGVwcy9kbG1hbGxvYy0wLjIuNi9zcmMvZGxtYWxsb2MucnNhc3NlcnRpb24gZmFpbGVkOiBwc2l6ZSA+PSBzaXplICsgbWluX292ZXJoZWFkAHgvEAApAAAAqAQAAAkAAABhc3NlcnRpb24gZmFpbGVkOiBwc2l6ZSA8PSBzaXplICsgbWF4X292ZXJoZWFkAAB4LxAAKQAAAK4EAAANAAAAQWNjZXNzRXJyb3JtZW1vcnkgYWxsb2NhdGlvbiBvZiAgYnl0ZXMgZmFpbGVkAAAAKzAQABUAAABAMBAADQAAAGxpYnJhcnkvc3RkL3NyYy9hbGxvYy5yc2AwEAAYAAAAZAEAAAkAAABYAAAADAAAAAQAAABcAAAAAAAAAAgAAAAEAAAAXQAAAAAAAAAIAAAABAAAAF4AAABfAAAAYAAAAGEAAABiAAAAEAAAAAQAAABjAAAAZAAAAGUAAABmAAAASGFzaCB0YWJsZSBjYXBhY2l0eSBvdmVyZmxvd+AwEAAcAAAAL3J1c3QvZGVwcy9oYXNoYnJvd24tMC4xNC41L3NyYy9yYXcvbW9kLnJzAAAEMRAAKgAAAFYAAAAoAAAARXJyb3IAAABnAAAADAAAAAQAAABoAAAAaQAAAGoAAABjYXBhY2l0eSBvdmVyZmxvdwAAAGAxEAARAAAAbGlicmFyeS9hbGxvYy9zcmMvcmF3X3ZlYy5yc3wxEAAcAAAAGQAAAAUAQbDjwAALvhwBAAAAawAAAGEgZm9ybWF0dGluZyB0cmFpdCBpbXBsZW1lbnRhdGlvbiByZXR1cm5lZCBhbiBlcnJvciB3aGVuIHRoZSB1bmRlcmx5aW5nIHN0cmVhbSBkaWQgbm90bGlicmFyeS9hbGxvYy9zcmMvZm10LnJzAAAOMhAAGAAAAH8CAAAOAAAAKSBzaG91bGQgYmUgPCBsZW4gKGlzIClpbnNlcnRpb24gaW5kZXggKGlzICkgc2hvdWxkIGJlIDw9IGxlbiAoaXMgAABPMhAAFAAAAGMyEAAXAAAATjIQAAEAAAByZW1vdmFsIGluZGV4IChpcyAAAJQyEAASAAAAODIQABYAAABOMhAAAQAAACkwMTIzNDU2Nzg5YWJjZGVmQm9ycm93TXV0RXJyb3JhbHJlYWR5IGJvcnJvd2VkOiAAAADfMhAAEgAAAFtjYWxsZWQgYE9wdGlvbjo6dW53cmFwKClgIG9uIGEgYE5vbmVgIHZhbHVlaW5kZXggb3V0IG9mIGJvdW5kczogdGhlIGxlbiBpcyAgYnV0IHRoZSBpbmRleCBpcyAAACgzEAAgAAAASDMQABIAAAAAAAAABAAAAAQAAABwAAAAPT0hPW1hdGNoZXNhc3NlcnRpb24gYGxlZnQgIHJpZ2h0YCBmYWlsZWQKICBsZWZ0OiAKIHJpZ2h0OiAAhzMQABAAAACXMxAAFwAAAK4zEAAJAAAAIHJpZ2h0YCBmYWlsZWQ6IAogIGxlZnQ6IAAAAIczEAAQAAAA0DMQABAAAADgMxAACQAAAK4zEAAJAAAAOiAAAAEAAAAAAAAADDQQAAIAAAAAAAAADAAAAAQAAABxAAAAcgAAAHMAAAAgICAgIHsgLCAgewosCn0gfSgoCiwKXWxpYnJhcnkvY29yZS9zcmMvZm10L251bS5ycwAATzQQABsAAABpAAAAFwAAADB4MDAwMTAyMDMwNDA1MDYwNzA4MDkxMDExMTIxMzE0MTUxNjE3MTgxOTIwMjEyMjIzMjQyNTI2MjcyODI5MzAzMTMyMzMzNDM1MzYzNzM4Mzk0MDQxNDI0MzQ0NDU0NjQ3NDg0OTUwNTE1MjUzNTQ1NTU2NTc1ODU5NjA2MTYyNjM2NDY1NjY2NzY4Njk3MDcxNzI3Mzc0NzU3Njc3Nzg3OTgwODE4MjgzODQ4NTg2ODc4ODg5OTA5MTkyOTM5NDk1OTY5Nzk4OTlsaWJyYXJ5L2NvcmUvc3JjL2ZtdC9tb2QucnMAAABGNRAAGwAAACUIAAAJAAAAAAAAAAgAAAAEAAAAbQAAAGZhbHNldHJ1ZXJhbmdlIHN0YXJ0IGluZGV4ICBvdXQgb2YgcmFuZ2UgZm9yIHNsaWNlIG9mIGxlbmd0aCAAAACNNRAAEgAAAJ81EAAiAAAAcmFuZ2UgZW5kIGluZGV4INQ1EAAQAAAAnzUQACIAAABzbGljZSBpbmRleCBzdGFydHMgYXQgIGJ1dCBlbmRzIGF0IAD0NRAAFgAAAAo2EAANAAAAYXR0ZW1wdGVkIHRvIGluZGV4IHNsaWNlIHVwIHRvIG1heGltdW0gdXNpemUoNhAALAAAAGxpYnJhcnkvY29yZS9zcmMvdW5pY29kZS9wcmludGFibGUucnMAAABcNhAAJQAAABoAAAA2AAAAXDYQACUAAAAKAAAAKwAAAAAGAQEDAQQCBQcHAggICQIKBQsCDgQQARECEgUTERQBFQIXAhkNHAUdCB8BJAFqBGsCrwOxArwCzwLRAtQM1QnWAtcC2gHgBeEC5wToAu4g8AT4AvoD+wEMJzs+Tk+Pnp6fe4uTlqKyuoaxBgcJNj0+VvPQ0QQUGDY3Vld/qq6vvTXgEoeJjp4EDQ4REikxNDpFRklKTk9kZVy2txscBwgKCxQXNjk6qKnY2Qk3kJGoBwo7PmZpj5IRb1+/7u9aYvT8/1NUmpsuLycoVZ2goaOkp6iturzEBgsMFR06P0VRpqfMzaAHGRoiJT4/5+zv/8XGBCAjJSYoMzg6SEpMUFNVVlhaXF5gY2Vma3N4fX+KpKqvsMDQrq9ub76TXiJ7BQMELQNmAwEvLoCCHQMxDxwEJAkeBSsFRAQOKoCqBiQEJAQoCDQLTkOBNwkWCggYO0U5A2MICTAWBSEDGwUBQDgESwUvBAoHCQdAICcEDAk2AzoFGgcEDAdQSTczDTMHLggKgSZSSysIKhYaJhwUFwlOBCQJRA0ZBwoGSAgnCXULQj4qBjsFCgZRBgEFEAMFgItiHkgICoCmXiJFCwoGDRM6Bgo2LAQXgLk8ZFMMSAkKRkUbSAhTDUkHCoD2RgodA0dJNwMOCAoGOQcKgTYZBzsDHFYBDzINg5tmdQuAxIpMYw2EMBAWj6qCR6G5gjkHKgRcBiYKRgooBROCsFtlSwQ5BxFABQsCDpf4CITWKgmi54EzDwEdBg4ECIGMiQRrBQ0DCQcQkmBHCXQ8gPYKcwhwFUZ6FAwUDFcJGYCHgUcDhUIPFYRQHwYGgNUrBT4hAXAtAxoEAoFAHxE6BQGB0CqC5oD3KUwECgQCgxFETD2AwjwGAQRVBRs0AoEOLARkDFYKgK44HQ0sBAkHAg4GgJqD2AQRAw0DdwRfBgwEAQ8MBDgICgYoCCJOgVQMHQMJBzYIDgQJBwkHgMslCoQGAAEDBQUGBgIHBggHCREKHAsZDBoNEA4MDwQQAxISEwkWARcEGAEZAxoHGwEcAh8WIAMrAy0LLgEwBDECMgGnAqkCqgSrCPoC+wX9Av4D/wmteHmLjaIwV1iLjJAc3Q4PS0z7/C4vP1xdX+KEjY6RkqmxurvFxsnK3uTl/wAEERIpMTQ3Ojs9SUpdhI6SqbG0urvGys7P5OUABA0OERIpMTQ6O0VGSUpeZGWEkZudyc7PDREpOjtFSVdbXF5fZGWNkam0urvFyd/k5fANEUVJZGWAhLK8vr/V1/Dxg4WLpKa+v8XHz9rbSJi9zcbOz0lOT1dZXl+Jjo+xtre/wcbH1xEWF1tc9vf+/4Btcd7fDh9ubxwdX31+rq9/u7wWFx4fRkdOT1haXF5+f7XF1NXc8PH1cnOPdHWWJi4vp6+3v8fP19+aAECXmDCPH9LUzv9OT1pbBwgPECcv7u9ubzc9P0JFkJFTZ3XIydDR2Nnn/v8AIF8igt8EgkQIGwQGEYGsDoCrBR8JgRsDGQgBBC8ENAQHAwEHBgcRClAPEgdVBwMEHAoJAwgDBwMCAwMDDAQFAwsGAQ4VBU4HGwdXBwIGFwxQBEMDLQMBBBEGDww6BB0lXyBtBGolgMgFgrADGgaC/QNZBxYJGAkUDBQMagYKBhoGWQcrBUYKLAQMBAEDMQssBBoGCwOArAYKBi8xTQOApAg8Aw8DPAc4CCsFgv8RGAgvES0DIQ8hD4CMBIKXGQsViJQFLwU7BwIOGAmAviJ0DIDWGoEQBYDfC/KeAzcJgVwUgLgIgMsFChg7AwoGOAhGCAwGdAseA1oEWQmAgxgcChYJTASAigarpAwXBDGhBIHaJgcMBQWAphCB9QcBICoGTASAjQSAvgMbAw8NbGlicmFyeS9jb3JlL3NyYy91bmljb2RlL3VuaWNvZGVfZGF0YS5ycwAfPBAAKAAAAFAAAAAoAAAAHzwQACgAAABcAAAAFgAAAGxpYnJhcnkvY29yZS9zcmMvZXNjYXBlLnJzAABoPBAAGgAAAE0AAAAFAAAAAAMAAIMEIACRBWAAXROgABIXIB8MIGAf7yygKyowICxvpuAsAqhgLR77YC4A/iA2nv9gNv0B4TYBCiE3JA3hN6sOYTkvGKE5MBxhSPMeoUxANGFQ8GqhUU9vIVKdvKFSAM9hU2XRoVMA2iFUAODhVa7iYVfs5CFZ0OihWSAA7lnwAX9aAHAABwAtAQEBAgECAQFICzAVEAFlBwIGAgIBBCMBHhtbCzoJCQEYBAEJAQMBBSsDPAgqGAEgNwEBAQQIBAEDBwoCHQE6AQEBAgQIAQkBCgIaAQICOQEEAgQCAgMDAR4CAwELAjkBBAUBAgQBFAIWBgEBOgEBAgEECAEHAwoCHgE7AQEBDAEJASgBAwE3AQEDBQMBBAcCCwIdAToBAgECAQMBBQIHAgsCHAI5AgEBAgQIAQkBCgIdAUgBBAECAwEBCAFRAQIHDAhiAQIJCwdJAhsBAQEBATcOAQUBAgULASQJAWYEAQYBAgICGQIEAxAEDQECAgYBDwEAAwADHQIeAh4CQAIBBwgBAgsJAS0DAQF1AiIBdgMEAgkBBgPbAgIBOgEBBwEBAQECCAYKAgEwHzEEMAcBAQUBKAkMAiAEAgIBAzgBAQIDAQEDOggCApgDAQ0BBwQBBgEDAsZAAAHDIQADjQFgIAAGaQIABAEKIAJQAgABAwEEARkCBQGXAhoSDQEmCBkLLgMwAQIEAgInAUMGAgICAgwBCAEvATMBAQMCAgUCAQEqAggB7gECAQQBAAEAEBAQAAIAAeIBlQUAAwECBQQoAwQBpQIABAACUANGCzEEewE2DykBAgIKAzEEAgIHAT0DJAUBCD4BDAI0CQoEAgFfAwIBAQIGAQIBnQEDCBUCOQIBAQEBFgEOBwMFwwgCAwEBFwFRAQIGAQECAQECAQLrAQIEBgIBAhsCVQgCAQECagEBAQIGAQFlAwIEAQUACQEC9QEKAgEBBAGQBAICBAEgCigGAgQIAQkGAgMuDQECAAcBBgEBUhYCBwECAQJ6BgMBAQIBBwEBSAIDAQEBAAILAjQFBQEBAQABBg8ABTsHAAE/BFEBAAIALgIXAAEBAwQFCAgCBx4ElAMANwQyCAEOARYFAQ8ABwERAgcBAgEFZAGgBwABPQQABAAHbQcAYIDwAHsJcHJvZHVjZXJzAghsYW5ndWFnZQEEUnVzdAAMcHJvY2Vzc2VkLWJ5AwVydXN0Yx0xLjgxLjAgKGVlYjkwY2RhMSAyMDI0LTA5LTA0KQZ3YWxydXMGMC4yMC4zDHdhc20tYmluZGdlbhIwLjIuOTIgKDJhNGE0OTM2MikALA90YXJnZXRfZmVhdHVyZXMCKw9tdXRhYmxlLWdsb2JhbHMrCHNpZ24tZXh0");

          var loadVt = async () => {
                  await __wbg_init(wasm_code);
                  return exports$1;
              };

  function parseNpt(time) {
    if (typeof time === "number") {
      return time;
    } else if (typeof time === "string") {
      return time.split(":").reverse().map(parseFloat).reduce((sum, n, i) => sum + n * Math.pow(60, i));
    } else {
      return undefined;
    }
  }
  function debounce(f, delay) {
    let timeout;
    return function () {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => f.apply(this, args), delay);
    };
  }
  function throttle(f, interval) {
    let enableCall = true;
    return function () {
      if (!enableCall) return;
      enableCall = false;
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      f.apply(this, args);
      setTimeout(() => enableCall = true, interval);
    };
  }
  function printablekeypress(key_press, logger) {
    let rep = JSON.stringify(key_press);
    const unicode_seq = {
      '" "': "Spc",
      '"\\r"': "Ret",
      '"\\t"': "Tab",
      '"\\u001b"': "Esc",
      '"\\u001b[3~"': "Supr",
      '"^?"': "back",
      '"\\u000b"': "beep",
      '"\\u001b[C"': "Right",
      '"\\u001bOC"': "Right",
      '"\\u001b[D"': "Left",
      '"\\u001bOD"': "Left",
      '"\\u001b[A"': "Up",
      '"\\u001bOA"': "Up",
      '"\\u001b[B"': "Down",
      '"\\u001bOB"': "Down",
      '"\\u001b[H"': "Home",
      '"\\u001b[5~"': "PgUp",
      '"\\u001b[6~"': "PgDn",
      '"\\u001b[57422u"': "PgDn",
      '"\\u001b[57362u"': "Pgup",
      '"\\u001bOP"': "F1",
      '"\\u001bOQ"': "F2",
      '"\\u001bOR"': "F3",
      '"\\u001bOS"': "F4",
      '"\\u001b[15~"': "F5",
      '"\\u001b[17~"': "F6",
      '"\\u001b[18~"': "F7",
      '"\\u001b[19~"': "F8",
      '"\\u001b[20~"': "F9",
      '"\\u001b[21~"': "F10",
      '"\\u001b[23~"': "F11",
      '"\\u001b[24~"': "F12",
      '"\\u0001"': "C-a",
      '"\\u0002"': "C-b",
      '"\\u0003"': "C-c",
      '"\\u0004"': "C-d",
      '"\\u0005"': "C-e",
      '"\\u0006"': "C-f",
      '"\\u0007"': "C-g",
      '"\\u0008"': "C-h",
      '"\\u0009"': "C-i",
      '"\\u0010"': "C-j",
      '"\\u0011"': "C-k",
      '"\\u0012"': "C-l",
      '"\\u0013"': "C-m",
      '"\\u0014"': "C-n",
      '"\\u0015"': "C-o",
      '"\\u0016"': "C-p",
      '"\\u0017"': "C-q",
      '"\\u0018"': "C-r",
      '"\\u0019"': "C-s",
      '"\\u0020"': "C-t",
      '"\\u0021"': "C-u",
      '"\\u0022"': "C-v",
      '"\\u0023"': "C-w",
      '"\\u0024"': "C-x",
      '"\\u0025"': "C-y",
      '"\\u0026"': "C-z",
      '"\\u001ba"': "A-a",
      '"\\u001bb"': "A-b",
      '"\\u001bc"': "A-c",
      '"\\u001bd"': "A-d",
      '"\\u001be"': "A-e",
      '"\\u001bf"': "A-f",
      '"\\u001bg"': "A-g",
      '"\\u001bh"': "A-h",
      '"\\u001bi"': "A-i",
      '"\\u001bj"': "A-j",
      '"\\u001bk"': "A-k",
      '"\\u001bl"': "A-l",
      '"\\u001bm"': "A-m",
      '"\\u001bn"': "A-n",
      '"\\u001bo"': "A-o",
      '"\\u001bp"': "A-p",
      '"\\u001bq"': "A-q",
      '"\\u001br"': "A-r",
      '"\\u001bs"': "A-s",
      '"\\u001bt"': "A-t",
      '"\\u001bu"': "A-u",
      '"\\u001bv"': "A-v",
      '"\\u001bw"': "A-w",
      '"\\u001bx"': "A-x",
      '"\\u001by"': "A-y",
      '"\\u001bz"': "A-z"
    };
    if (rep in unicode_seq) {
      return unicode_seq[rep];
    } else if (rep.startsWith('"\\')) {
      logger.info("- ", rep, key_press);
      return "";
    }
    return rep.slice(1, -1);
  }

  class Clock {
    constructor() {
      let speed = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1.0;
      this.speed = speed;
      this.startTime = performance.now();
    }
    getTime() {
      return this.speed * (performance.now() - this.startTime) / 1000.0;
    }
    setTime(time) {
      this.startTime = performance.now() - time / this.speed * 1000.0;
    }
  }
  class NullClock {
    constructor() {}
    getTime(_speed) {}
    setTime(_time) {}
  }

  const vt = loadVt(); // trigger async loading of wasm

  class State {
    constructor(core) {
      this.core = core;
      this.driver = core.driver;
    }
    onEnter(data) {}
    init() {}
    play() {}
    pause() {}
    togglePlay() {}
    seek(where) {
      return false;
    }
    step() {}
    stop() {
      this.driver.stop();
    }
  }
  class UninitializedState extends State {
    async init() {
      try {
        await this.core.initializeDriver();
        return this.core.setState("idle");
      } catch (e) {
        this.core.setState("errored");
        throw e;
      }
    }
    async play() {
      this.core.dispatchEvent("play");
      const idleState = await this.init();
      await idleState.doPlay();
    }
    async togglePlay() {
      await this.play();
    }
    async seek(where) {
      const idleState = await this.init();
      return await idleState.seek(where);
    }
    async step() {
      const idleState = await this.init();
      await idleState.step();
    }
    stop() {}
  }
  class Idle extends State {
    onEnter(_ref) {
      let {
        reason,
        message
      } = _ref;
      this.core.dispatchEvent("idle", {
        message
      });
      if (reason === "paused") {
        this.core.dispatchEvent("pause");
      }
    }
    async play() {
      this.core.dispatchEvent("play");
      await this.doPlay();
    }
    async doPlay() {
      const stop = await this.driver.play();
      if (stop === true) {
        this.core.setState("playing");
      } else if (typeof stop === "function") {
        this.core.setState("playing");
        this.driver.stop = stop;
      }
    }
    async togglePlay() {
      await this.play();
    }
    seek(where) {
      return this.driver.seek(where);
    }
    step() {
      this.driver.step();
    }
  }
  class PlayingState extends State {
    onEnter() {
      this.core.dispatchEvent("playing");
    }
    pause() {
      if (this.driver.pause() === true) {
        this.core.setState("idle", {
          reason: "paused"
        });
      }
    }
    togglePlay() {
      this.pause();
    }
    seek(where) {
      return this.driver.seek(where);
    }
  }
  class LoadingState extends State {
    onEnter() {
      this.core.dispatchEvent("loading");
    }
  }
  class OfflineState extends State {
    onEnter(_ref2) {
      let {
        message
      } = _ref2;
      this.core.dispatchEvent("offline", {
        message
      });
    }
  }
  class EndedState extends State {
    onEnter(_ref3) {
      let {
        message
      } = _ref3;
      this.core.dispatchEvent("ended", {
        message
      });
    }
    async play() {
      this.core.dispatchEvent("play");
      if (await this.driver.restart()) {
        this.core.setState('playing');
      }
    }
    async togglePlay() {
      await this.play();
    }
    seek(where) {
      if (this.driver.seek(where) === true) {
        this.core.setState('idle');
        return true;
      }
      return false;
    }
  }
  class ErroredState extends State {
    onEnter() {
      this.core.dispatchEvent("errored");
    }
  }
  class Core {
    // public

    constructor(driverFn, opts) {
      this.logger = opts.logger;
      this.state = new UninitializedState(this);
      this.stateName = "uninitialized";
      this.driver = null;
      this.driverFn = driverFn;
      this.changedLines = new Set();
      this.cursor = undefined;
      this.duration = undefined;
      this.cols = opts.cols;
      this.rows = opts.rows;
      this.speed = opts.speed ?? 1.0;
      this.loop = opts.loop;
      this.idleTimeLimit = opts.idleTimeLimit;
      this.preload = opts.preload;
      this.startAt = parseNpt(opts.startAt);
      this.poster = this.parsePoster(opts.poster);
      this.markers = this.normalizeMarkers(opts.markers);
      this.pauseOnMarkers = opts.pauseOnMarkers;
      this.commandQueue = Promise.resolve();
      this.hideKeystroke = opts.hideKeystroke ?? false;
      this.eventHandlers = new Map([["ended", []], ["errored", []], ["idle", []], ["init", []], ["input", []], ["loading", []], ["marker", []], ["offline", []], ["pause", []], ["play", []], ["playing", []], ["reset", []], ["resize", []], ["seeked", []], ["terminalUpdate", []]]);
    }
    addEventListener(eventName, handler) {
      this.eventHandlers.get(eventName).push(handler);
    }
    dispatchEvent(eventName) {
      let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      for (const h of this.eventHandlers.get(eventName)) {
        h(data);
      }
    }
    async init() {
      this.wasm = await vt;
      const feed = this.feed.bind(this);
      const onInput = data => {
        this.dispatchEvent("input", {
          data
        });
      };
      const onMarker = _ref4 => {
        let {
          index,
          time,
          label
        } = _ref4;
        this.dispatchEvent("marker", {
          index,
          time,
          label
        });
      };
      const now = this.now.bind(this);
      const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
      const setInterval = (f, t) => window.setInterval(f, t / this.speed);
      const reset = this.resetVt.bind(this);
      const setState = this.setState.bind(this);
      const posterTime = this.poster.type === "npt" ? this.poster.value : undefined;
      this.driver = this.driverFn({
        feed,
        onInput,
        onMarker,
        reset,
        now,
        setTimeout,
        setInterval,
        setState,
        logger: this.logger
      }, {
        cols: this.cols,
        rows: this.rows,
        idleTimeLimit: this.idleTimeLimit,
        startAt: this.startAt,
        loop: this.loop,
        posterTime: posterTime,
        markers: this.markers,
        pauseOnMarkers: this.pauseOnMarkers
      });
      if (typeof this.driver === "function") {
        this.driver = {
          play: this.driver
        };
      }
      if (this.preload || posterTime !== undefined) {
        this.withState(state => state.init());
      }
      const poster = this.poster.type === "text" ? this.renderPoster(this.poster.value) : undefined;
      const config = {
        isPausable: !!this.driver.pause,
        isSeekable: !!this.driver.seek,
        poster
      };
      if (this.driver.init === undefined) {
        this.driver.init = () => {
          return {};
        };
      }
      if (this.driver.pause === undefined) {
        this.driver.pause = () => {};
      }
      if (this.driver.seek === undefined) {
        this.driver.seek = where => false;
      }
      if (this.driver.step === undefined) {
        this.driver.step = () => {};
      }
      if (this.driver.stop === undefined) {
        this.driver.stop = () => {};
      }
      if (this.driver.restart === undefined) {
        this.driver.restart = () => {};
      }
      if (this.driver.getCurrentTime === undefined) {
        const play = this.driver.play;
        let clock = new NullClock();
        this.driver.play = () => {
          clock = new Clock(this.speed);
          return play();
        };
        this.driver.getCurrentTime = () => clock.getTime();
      }
      return config;
    }
    play() {
      return this.withState(state => state.play());
    }
    pause() {
      return this.withState(state => state.pause());
    }
    togglePlay() {
      return this.withState(state => state.togglePlay());
    }
    seek(where) {
      return this.withState(async state => {
        if (await state.seek(where)) {
          this.dispatchEvent("seeked");
        }
      });
    }
    step() {
      return this.withState(state => state.step());
    }
    stop() {
      return this.withState(state => state.stop());
    }
    withState(f) {
      return this.enqueueCommand(() => f(this.state));
    }
    enqueueCommand(f) {
      this.commandQueue = this.commandQueue.then(f);
      return this.commandQueue;
    }
    getChangedLines() {
      if (this.changedLines.size > 0) {
        const lines = new Map();
        const rows = this.vt.rows;
        for (const i of this.changedLines) {
          if (i < rows) {
            lines.set(i, {
              id: i,
              segments: this.vt.get_line(i)
            });
          }
        }
        this.changedLines.clear();
        return lines;
      }
    }
    getCursor() {
      if (this.cursor === undefined && this.vt) {
        this.cursor = this.vt.get_cursor() ?? false;
      }
      return this.cursor;
    }
    getCurrentTime() {
      return this.driver.getCurrentTime();
    }
    getRemainingTime() {
      if (typeof this.duration === "number") {
        return this.duration - Math.min(this.getCurrentTime(), this.duration);
      }
    }
    getProgress() {
      if (typeof this.duration === "number") {
        return Math.min(this.getCurrentTime(), this.duration) / this.duration;
      }
    }
    getDuration() {
      return this.duration;
    }

    // private

    setState(newState) {
      let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (this.stateName === newState) return this.state;
      this.stateName = newState;
      if (newState === "playing") {
        this.state = new PlayingState(this);
      } else if (newState === "idle") {
        this.state = new Idle(this);
      } else if (newState === "loading") {
        this.state = new LoadingState(this);
      } else if (newState === "ended") {
        this.state = new EndedState(this);
      } else if (newState === "offline") {
        this.state = new OfflineState(this);
      } else if (newState === "errored") {
        this.state = new ErroredState(this);
      } else {
        throw `invalid state: ${newState}`;
      }
      this.state.onEnter(data);
      return this.state;
    }
    feed(data) {
      this.doFeed(data);
      this.dispatchEvent("terminalUpdate");
    }
    doFeed(data) {
      const [affectedLines, resized] = this.vt.feed(data);
      affectedLines.forEach(i => this.changedLines.add(i));
      this.cursor = undefined;
      if (resized) {
        const [cols, rows] = this.vt.get_size();
        this.vt.cols = cols;
        this.vt.rows = rows;
        this.logger.debug(`core: vt resize (${cols}x${rows})`);
        this.dispatchEvent("resize", {
          cols,
          rows
        });
      }
    }
    now() {
      return performance.now() * this.speed;
    }
    async initializeDriver() {
      const meta = await this.driver.init();
      this.cols = this.cols ?? meta.cols ?? 80;
      this.rows = this.rows ?? meta.rows ?? 24;
      this.duration = this.duration ?? meta.duration;
      this.markers = this.normalizeMarkers(meta.markers) ?? this.markers ?? [];
      if (this.cols === 0) {
        this.cols = 80;
      }
      if (this.rows === 0) {
        this.rows = 24;
      }
      this.initializeVt(this.cols, this.rows);
      const poster = meta.poster !== undefined ? this.renderPoster(meta.poster) : undefined;
      this.dispatchEvent("init", {
        cols: this.cols,
        rows: this.rows,
        duration: this.duration,
        markers: this.markers,
        theme: meta.theme,
        poster
      });
    }
    resetVt(cols, rows) {
      let init = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;
      let theme = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : undefined;
      this.cols = cols;
      this.rows = rows;
      this.cursor = undefined;
      this.initializeVt(cols, rows);
      if (init !== undefined && init !== "") {
        this.doFeed(init);
      }
      this.dispatchEvent("reset", {
        cols,
        rows,
        theme
      });
    }
    initializeVt(cols, rows) {
      this.logger.debug(`core: vt init (${cols}x${rows})`);
      this.vt = this.wasm.create(cols, rows, true, 100);
      this.vt.cols = cols;
      this.vt.rows = rows;
      this.changedLines.clear();
      for (let i = 0; i < rows; i++) {
        this.changedLines.add(i);
      }
    }
    parsePoster(poster) {
      if (typeof poster !== "string") return {};
      if (poster.substring(0, 16) == "data:text/plain,") {
        return {
          type: "text",
          value: [poster.substring(16)]
        };
      } else if (poster.substring(0, 4) == "npt:") {
        return {
          type: "npt",
          value: parseNpt(poster.substring(4))
        };
      }
      return {};
    }
    renderPoster(poster) {
      const cols = this.cols ?? 80;
      const rows = this.rows ?? 24;
      this.logger.debug(`core: poster init (${cols}x${rows})`);
      const vt = this.wasm.create(cols, rows, false, 0);
      poster.forEach(text => vt.feed(text));
      const cursor = vt.get_cursor() ?? false;
      const lines = [];
      for (let i = 0; i < rows; i++) {
        lines.push({
          id: i,
          segments: vt.get_line(i)
        });
      }
      return {
        cursor,
        lines
      };
    }
    normalizeMarkers(markers) {
      if (Array.isArray(markers)) {
        return markers.map(m => typeof m === "number" ? [m, ""] : m);
      }
    }
  }

  const $RAW = Symbol("store-raw"),
    $NODE = Symbol("store-node"),
    $NAME = Symbol("store-name");
  function wrap$1(value, name) {
    let p = value[$PROXY];
    if (!p) {
      Object.defineProperty(value, $PROXY, {
        value: p = new Proxy(value, proxyTraps$1)
      });
      if (!Array.isArray(value)) {
        const keys = Object.keys(value),
          desc = Object.getOwnPropertyDescriptors(value);
        for (let i = 0, l = keys.length; i < l; i++) {
          const prop = keys[i];
          if (desc[prop].get) {
            Object.defineProperty(value, prop, {
              enumerable: desc[prop].enumerable,
              get: desc[prop].get.bind(p)
            });
          }
        }
      }
    }
    return p;
  }
  function isWrappable(obj) {
    let proto;
    return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
  }
  function unwrap(item, set = new Set()) {
    let result, unwrapped, v, prop;
    if (result = item != null && item[$RAW]) return result;
    if (!isWrappable(item) || set.has(item)) return item;
    if (Array.isArray(item)) {
      if (Object.isFrozen(item)) item = item.slice(0);else set.add(item);
      for (let i = 0, l = item.length; i < l; i++) {
        v = item[i];
        if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
      }
    } else {
      if (Object.isFrozen(item)) item = Object.assign({}, item);else set.add(item);
      const keys = Object.keys(item),
        desc = Object.getOwnPropertyDescriptors(item);
      for (let i = 0, l = keys.length; i < l; i++) {
        prop = keys[i];
        if (desc[prop].get) continue;
        v = item[prop];
        if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
      }
    }
    return item;
  }
  function getDataNodes(target) {
    let nodes = target[$NODE];
    if (!nodes) Object.defineProperty(target, $NODE, {
      value: nodes = {}
    });
    return nodes;
  }
  function getDataNode(nodes, property, value) {
    return nodes[property] || (nodes[property] = createDataNode(value));
  }
  function proxyDescriptor$1(target, property) {
    const desc = Reflect.getOwnPropertyDescriptor(target, property);
    if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE || property === $NAME) return desc;
    delete desc.value;
    delete desc.writable;
    desc.get = () => target[$PROXY][property];
    return desc;
  }
  function trackSelf(target) {
    if (getListener()) {
      const nodes = getDataNodes(target);
      (nodes._ || (nodes._ = createDataNode()))();
    }
  }
  function ownKeys(target) {
    trackSelf(target);
    return Reflect.ownKeys(target);
  }
  function createDataNode(value) {
    const [s, set] = createSignal(value, {
      equals: false,
      internal: true
    });
    s.$ = set;
    return s;
  }
  const proxyTraps$1 = {
    get(target, property, receiver) {
      if (property === $RAW) return target;
      if (property === $PROXY) return receiver;
      if (property === $TRACK) {
        trackSelf(target);
        return receiver;
      }
      const nodes = getDataNodes(target);
      const tracked = nodes.hasOwnProperty(property);
      let value = tracked ? nodes[property]() : target[property];
      if (property === $NODE || property === "__proto__") return value;
      if (!tracked) {
        const desc = Object.getOwnPropertyDescriptor(target, property);
        if (getListener() && (typeof value !== "function" || target.hasOwnProperty(property)) && !(desc && desc.get)) value = getDataNode(nodes, property, value)();
      }
      return isWrappable(value) ? wrap$1(value) : value;
    },
    has(target, property) {
      if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === "__proto__") return true;
      this.get(target, property, target);
      return property in target;
    },
    set() {
      return true;
    },
    deleteProperty() {
      return true;
    },
    ownKeys: ownKeys,
    getOwnPropertyDescriptor: proxyDescriptor$1
  };
  function setProperty(state, property, value, deleting = false) {
    if (!deleting && state[property] === value) return;
    const prev = state[property],
      len = state.length;
    if (value === undefined) delete state[property];else state[property] = value;
    let nodes = getDataNodes(state),
      node;
    if (node = getDataNode(nodes, property, prev)) node.$(() => value);
    if (Array.isArray(state) && state.length !== len) (node = getDataNode(nodes, "length", len)) && node.$(state.length);
    (node = nodes._) && node.$();
  }
  function mergeStoreNode(state, value) {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      setProperty(state, key, value[key]);
    }
  }
  function updateArray(current, next) {
    if (typeof next === "function") next = next(current);
    next = unwrap(next);
    if (Array.isArray(next)) {
      if (current === next) return;
      let i = 0,
        len = next.length;
      for (; i < len; i++) {
        const value = next[i];
        if (current[i] !== value) setProperty(current, i, value);
      }
      setProperty(current, "length", len);
    } else mergeStoreNode(current, next);
  }
  function updatePath(current, path, traversed = []) {
    let part,
      prev = current;
    if (path.length > 1) {
      part = path.shift();
      const partType = typeof part,
        isArray = Array.isArray(current);
      if (Array.isArray(part)) {
        for (let i = 0; i < part.length; i++) {
          updatePath(current, [part[i]].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "function") {
        for (let i = 0; i < current.length; i++) {
          if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "object") {
        const {
          from = 0,
          to = current.length - 1,
          by = 1
        } = part;
        for (let i = from; i <= to; i += by) {
          updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (path.length > 1) {
        updatePath(current[part], path, [part].concat(traversed));
        return;
      }
      prev = current[part];
      traversed = [part].concat(traversed);
    }
    let value = path[0];
    if (typeof value === "function") {
      value = value(prev, traversed);
      if (value === prev) return;
    }
    if (part === undefined && value == undefined) return;
    value = unwrap(value);
    if (part === undefined || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
      mergeStoreNode(prev, value);
    } else setProperty(current, part, value);
  }
  function createStore(...[store, options]) {
    const unwrappedStore = unwrap(store || {});
    const isArray = Array.isArray(unwrappedStore);
    const wrappedStore = wrap$1(unwrappedStore);
    function setStore(...args) {
      batch(() => {
        isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
      });
    }
    return [wrappedStore, setStore];
  }

  const $ROOT = Symbol("store-root");
  function applyState(target, parent, property, merge, key) {
    const previous = parent[property];
    if (target === previous) return;
    if (!isWrappable(target) || !isWrappable(previous) || key && target[key] !== previous[key]) {
      if (target !== previous) {
        if (property === $ROOT) return target;
        setProperty(parent, property, target);
      }
      return;
    }
    if (Array.isArray(target)) {
      if (target.length && previous.length && (!merge || key && target[0] && target[0][key] != null)) {
        let i, j, start, end, newEnd, item, newIndicesNext, keyVal;
        for (start = 0, end = Math.min(previous.length, target.length); start < end && (previous[start] === target[start] || key && previous[start] && target[start] && previous[start][key] === target[start][key]); start++) {
          applyState(target[start], previous, start, merge, key);
        }
        const temp = new Array(target.length),
          newIndices = new Map();
        for (end = previous.length - 1, newEnd = target.length - 1; end >= start && newEnd >= start && (previous[end] === target[newEnd] || key && previous[start] && target[start] && previous[end][key] === target[newEnd][key]); end--, newEnd--) {
          temp[newEnd] = previous[end];
        }
        if (start > newEnd || start > end) {
          for (j = start; j <= newEnd; j++) setProperty(previous, j, target[j]);
          for (; j < target.length; j++) {
            setProperty(previous, j, temp[j]);
            applyState(target[j], previous, j, merge, key);
          }
          if (previous.length > target.length) setProperty(previous, "length", target.length);
          return;
        }
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = target[j];
          keyVal = key && item ? item[key] : item;
          i = newIndices.get(keyVal);
          newIndicesNext[j] = i === undefined ? -1 : i;
          newIndices.set(keyVal, j);
        }
        for (i = start; i <= end; i++) {
          item = previous[i];
          keyVal = key && item ? item[key] : item;
          j = newIndices.get(keyVal);
          if (j !== undefined && j !== -1) {
            temp[j] = previous[i];
            j = newIndicesNext[j];
            newIndices.set(keyVal, j);
          }
        }
        for (j = start; j < target.length; j++) {
          if (j in temp) {
            setProperty(previous, j, temp[j]);
            applyState(target[j], previous, j, merge, key);
          } else setProperty(previous, j, target[j]);
        }
      } else {
        for (let i = 0, len = target.length; i < len; i++) {
          applyState(target[i], previous, i, merge, key);
        }
      }
      if (previous.length > target.length) setProperty(previous, "length", target.length);
      return;
    }
    const targetKeys = Object.keys(target);
    for (let i = 0, len = targetKeys.length; i < len; i++) {
      applyState(target[targetKeys[i]], previous, targetKeys[i], merge, key);
    }
    const previousKeys = Object.keys(previous);
    for (let i = 0, len = previousKeys.length; i < len; i++) {
      if (target[previousKeys[i]] === undefined) setProperty(previous, previousKeys[i], undefined);
    }
  }
  function reconcile(value, options = {}) {
    const {
        merge,
        key = "id"
      } = options,
      v = unwrap(value);
    return state => {
      if (!isWrappable(state) || !isWrappable(v)) return v;
      const res = applyState(v, {
        [$ROOT]: state
      }, $ROOT, merge, key);
      return res === undefined ? state : res;
    };
  }

  const _tmpl$$a = /*#__PURE__*/template(`<span></span>`);
  var Segment = (props => {
    const codePoint = createMemo(() => {
      if (props.text.length == 1) {
        const cp = props.text.codePointAt(0);
        if (cp >= 0x2580 && cp <= 0x259f || cp == 0xe0b0 || cp == 0xe0b2) {
          return cp;
        }
      }
    });
    const text = createMemo(() => codePoint() ? " " : props.text);
    const style$1 = createMemo(() => buildStyle(props.pen, props.offset, text().length, props.charWidth));
    const className$1 = createMemo(() => buildClassName(props.pen, codePoint(), props.extraClass));
    return (() => {
      const _el$ = _tmpl$$a.cloneNode(true);
      insert(_el$, text);
      createRenderEffect(_p$ => {
        const _v$ = className$1(),
          _v$2 = style$1();
        _v$ !== _p$._v$ && className(_el$, _p$._v$ = _v$);
        _p$._v$2 = style(_el$, _v$2, _p$._v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });
      return _el$;
    })();
  });
  function buildClassName(attrs, codePoint, extraClass) {
    const fgClass = colorClass(attrs.get("fg"), attrs.get("bold"), "fg-");
    const bgClass = colorClass(attrs.get("bg"), attrs.get("blink"), "bg-");
    let cls = extraClass ?? "";
    if (codePoint !== undefined) {
      cls += ` cp-${codePoint.toString(16)}`;
    }
    if (fgClass) {
      cls += " " + fgClass;
    }
    if (bgClass) {
      cls += " " + bgClass;
    }
    if (attrs.has("bold")) {
      cls += " ap-bright";
    }
    if (attrs.has("faint")) {
      cls += " ap-faint";
    }
    if (attrs.has("italic")) {
      cls += " ap-italic";
    }
    if (attrs.has("underline")) {
      cls += " ap-underline";
    }
    if (attrs.has("blink")) {
      cls += " ap-blink";
    }
    if (attrs.get("inverse")) {
      cls += " ap-inverse";
    }
    return cls;
  }
  function colorClass(color, intense, prefix) {
    if (typeof color === "number") {
      if (intense && color < 8) {
        color += 8;
      }
      return `${prefix}${color}`;
    }
  }
  function buildStyle(attrs, offset, textLen, charWidth) {
    const fg = attrs.get("fg");
    const bg = attrs.get("bg");
    let style = {
      "--offset": offset,
      width: `${textLen * charWidth + 0.01}ch`
    };
    if (typeof fg === "string") {
      style["--fg"] = fg;
    }
    if (typeof bg === "string") {
      style["--bg"] = bg;
    }
    return style;
  }

  const _tmpl$$9 = /*#__PURE__*/template(`<span class="ap-line" role="paragraph"></span>`);
  var Line = (props => {
    const segments = () => {
      if (typeof props.cursor === "number") {
        const segs = [];
        let len = 0;
        let i = 0;
        while (i < props.segments.length && len + props.segments[i].text.length - 1 < props.cursor) {
          const seg = props.segments[i];
          segs.push(seg);
          len += seg.text.length;
          i++;
        }
        if (i < props.segments.length) {
          const seg = props.segments[i];
          const pos = props.cursor - len;
          if (pos > 0) {
            segs.push({
              ...seg,
              text: seg.text.substring(0, pos)
            });
          }
          segs.push({
            ...seg,
            text: seg.text[pos],
            offset: seg.offset + pos,
            extraClass: "ap-cursor"
          });
          if (pos < seg.text.length - 1) {
            segs.push({
              ...seg,
              text: seg.text.substring(pos + 1),
              offset: seg.offset + pos + 1
            });
          }
          i++;
          while (i < props.segments.length) {
            const seg = props.segments[i];
            segs.push(seg);
            i++;
          }
        }
        return segs;
      } else {
        return props.segments;
      }
    };
    return (() => {
      const _el$ = _tmpl$$9.cloneNode(true);
      insert(_el$, createComponent(Index, {
        get each() {
          return segments();
        },
        children: s => createComponent(Segment, mergeProps(s))
      }));
      return _el$;
    })();
  });

  const _tmpl$$8 = /*#__PURE__*/template(`<pre class="ap-terminal" aria-live="polite" tabindex="0"></pre>`);
  var Terminal = (props => {
    const lineHeight = () => props.lineHeight ?? 1.3333333333;
    const style$1 = createMemo(() => {
      return {
        width: `${props.cols}ch`,
        height: `${lineHeight() * props.rows}em`,
        "font-size": `${(props.scale || 1.0) * 100}%`,
        "font-family": props.fontFamily,
        "--term-line-height": `${lineHeight()}em`,
        "--term-cols": props.cols
      };
    });
    const cursorCol = createMemo(() => props.cursor?.[0]);
    const cursorRow = createMemo(() => props.cursor?.[1]);
    return (() => {
      const _el$ = _tmpl$$8.cloneNode(true);
      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;
      insert(_el$, createComponent(For, {
        get each() {
          return props.lines;
        },
        children: (line, i) => createComponent(Line, {
          get segments() {
            return line.segments;
          },
          get cursor() {
            return createMemo(() => i() === cursorRow())() ? cursorCol() : null;
          }
        })
      }));
      createRenderEffect(_p$ => {
        const _v$ = !!(props.blink || props.cursorHold),
          _v$2 = !!props.blink,
          _v$3 = style$1();
        _v$ !== _p$._v$ && _el$.classList.toggle("ap-cursor-on", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && _el$.classList.toggle("ap-blink", _p$._v$2 = _v$2);
        _p$._v$3 = style(_el$, _v$3, _p$._v$3);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });
      return _el$;
    })();
  });

  const _tmpl$$7 = /*#__PURE__*/template(`<svg version="1.1" viewBox="0 0 12 12" class="ap-icon" aria-label="Pause" role="button"><path d="M1,0 L4,0 L4,12 L1,12 Z"></path><path d="M8,0 L11,0 L11,12 L8,12 Z"></path></svg>`),
    _tmpl$2 = /*#__PURE__*/template(`<svg version="1.1" viewBox="0 0 12 12" class="ap-icon" aria-label="Play" role="button"><path d="M1,0 L11,6 L1,12 Z"></path></svg>`),
    _tmpl$3 = /*#__PURE__*/template(`<span class="ap-playback-button" tabindex="0"></span>`),
    _tmpl$4 = /*#__PURE__*/template(`<span class="ap-progressbar"><span class="ap-bar"><span class="ap-gutter ap-gutter-empty"></span><span class="ap-gutter ap-gutter-full"></span></span></span>`),
    _tmpl$5 = /*#__PURE__*/template(`<div class="ap-control-bar"><span class="ap-timer" aria-readonly="true" role="textbox" tabindex="0"><span class="ap-time-elapsed"></span><span class="ap-time-remaining"></span></span><span class="ap-fullscreen-button ap-tooltip-container" aria-label="Toggle fullscreen mode" role="button" tabindex="0"><svg version="1.1" viewBox="0 0 12 12" class="ap-icon ap-icon-fullscreen-on"><path d="M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"></path><path d="M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"></path></svg><svg version="1.1" viewBox="0 0 12 12" class="ap-icon ap-icon-fullscreen-off"><path d="M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"></path><path d="M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"></path></svg><span class="ap-tooltip">Fullscreen (f)</span></span></div>`),
    _tmpl$6 = /*#__PURE__*/template(`<span class="ap-marker-container ap-tooltip-container"><span class="ap-marker"></span><span class="ap-tooltip"></span></span>`);
  function formatTime(seconds) {
    let s = Math.floor(seconds);
    const d = Math.floor(s / 86400);
    s %= 86400;
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    if (d > 0) {
      return `${zeroPad(d)}:${zeroPad(h)}:${zeroPad(m)}:${zeroPad(s)}`;
    } else if (h > 0) {
      return `${zeroPad(h)}:${zeroPad(m)}:${zeroPad(s)}`;
    } else {
      return `${zeroPad(m)}:${zeroPad(s)}`;
    }
  }
  function zeroPad(n) {
    return n < 10 ? `0${n}` : n.toString();
  }
  var ControlBar = (props => {
    const e = f => {
      return e => {
        e.preventDefault();
        f(e);
      };
    };
    const currentTime = () => typeof props.currentTime === "number" ? formatTime(props.currentTime) : "--:--";
    const remainingTime = () => typeof props.remainingTime === "number" ? "-" + formatTime(props.remainingTime) : currentTime();
    const markers = createMemo(() => typeof props.duration === "number" ? props.markers.filter(m => m[0] < props.duration) : []);
    const markerPosition = m => `${m[0] / props.duration * 100}%`;
    const markerText = m => {
      if (m[1] === "") {
        return formatTime(m[0]);
      } else {
        return `${formatTime(m[0])} - ${m[1]}`;
      }
    };
    const isPastMarker = m => typeof props.currentTime === "number" ? m[0] <= props.currentTime : false;
    const gutterBarStyle = () => {
      return {
        transform: `scaleX(${props.progress || 0}`
      };
    };
    const calcPosition = e => {
      const barWidth = e.currentTarget.offsetWidth;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pos = Math.max(0, mouseX / barWidth);
      return `${pos * 100}%`;
    };
    const [mouseDown, setMouseDown] = createSignal(false);
    const throttledSeek = throttle(props.onSeekClick, 50);
    const onMouseDown = e => {
      if (e._marker) return;
      if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey || e.button !== 0) return;
      setMouseDown(true);
      props.onSeekClick(calcPosition(e));
    };
    const seekToMarker = index => {
      return e(() => {
        props.onSeekClick({
          marker: index
        });
      });
    };
    const onMove = e => {
      if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (mouseDown()) {
        throttledSeek(calcPosition(e));
      }
    };
    const onDocumentMouseUp = () => {
      setMouseDown(false);
    };
    document.addEventListener("mouseup", onDocumentMouseUp);
    onCleanup(() => {
      document.removeEventListener("mouseup", onDocumentMouseUp);
    });
    return (() => {
      const _el$ = _tmpl$5.cloneNode(true),
        _el$5 = _el$.firstChild,
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.nextSibling,
        _el$12 = _el$5.nextSibling;
      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;
      insert(_el$, createComponent(Show, {
        get when() {
          return props.isPausable;
        },
        get children() {
          const _el$2 = _tmpl$3.cloneNode(true);
          addEventListener(_el$2, "click", e(props.onPlayClick), true);
          insert(_el$2, createComponent(Switch, {
            get children() {
              return [createComponent(Match, {
                get when() {
                  return props.isPlaying;
                },
                get children() {
                  return _tmpl$$7.cloneNode(true);
                }
              }), createComponent(Match, {
                get when() {
                  return !props.isPlaying;
                },
                get children() {
                  return _tmpl$2.cloneNode(true);
                }
              })];
            }
          }));
          return _el$2;
        }
      }), _el$5);
      insert(_el$6, currentTime);
      insert(_el$7, remainingTime);
      insert(_el$, createComponent(Show, {
        get when() {
          return typeof props.progress === "number" || props.isSeekable;
        },
        get children() {
          const _el$8 = _tmpl$4.cloneNode(true),
            _el$9 = _el$8.firstChild,
            _el$10 = _el$9.firstChild,
            _el$11 = _el$10.nextSibling;
          _el$9.$$mousemove = onMove;
          _el$9.$$mousedown = onMouseDown;
          insert(_el$9, createComponent(For, {
            get each() {
              return markers();
            },
            children: (m, i) => (() => {
              const _el$13 = _tmpl$6.cloneNode(true),
                _el$14 = _el$13.firstChild,
                _el$15 = _el$14.nextSibling;
              _el$13.$$mousedown = e => {
                e._marker = true;
              };
              addEventListener(_el$13, "click", seekToMarker(i()), true);
              insert(_el$15, () => markerText(m));
              createRenderEffect(_p$ => {
                const _v$ = markerPosition(m),
                  _v$2 = !!isPastMarker(m);
                _v$ !== _p$._v$ && _el$13.style.setProperty("left", _p$._v$ = _v$);
                _v$2 !== _p$._v$2 && _el$14.classList.toggle("ap-marker-past", _p$._v$2 = _v$2);
                return _p$;
              }, {
                _v$: undefined,
                _v$2: undefined
              });
              return _el$13;
            })()
          }), null);
          createRenderEffect(_$p => style(_el$11, gutterBarStyle(), _$p));
          return _el$8;
        }
      }), _el$12);
      addEventListener(_el$12, "click", e(props.onFullscreenClick), true);
      createRenderEffect(() => _el$.classList.toggle("ap-seekable", !!props.isSeekable));
      return _el$;
    })();
  });
  delegateEvents(["click", "mousedown", "mousemove"]);

  const _tmpl$$6 = /*#__PURE__*/template(`<div class="ap-overlay ap-overlay-error"><span>💥</span></div>`);
  var ErrorOverlay = (props => {
    return _tmpl$$6.cloneNode(true);
  });

  const _tmpl$$5 = /*#__PURE__*/template(`<div class="ap-overlay ap-overlay-loading"><span class="ap-loader"></span></div>`);
  var LoaderOverlay = (props => {
    return _tmpl$$5.cloneNode(true);
  });

  const _tmpl$$4 = /*#__PURE__*/template(`<div class="ap-overlay ap-overlay-info"><span></span></div>`);
  var InfoOverlay = (props => {
    const style$1 = () => {
      return {
        "font-family": props.fontFamily
      };
    };
    return (() => {
      const _el$ = _tmpl$$4.cloneNode(true),
        _el$2 = _el$.firstChild;
      insert(_el$2, () => props.message);
      createRenderEffect(_$p => style(_el$2, style$1(), _$p));
      return _el$;
    })();
  });

  const _tmpl$$3 = /*#__PURE__*/template(`<div class="ap-overlay ap-overlay-start"><div class="ap-play-button"><div><span><svg version="1.1" viewBox="0 0 1000.0 1000.0" class="ap-icon"><defs><mask id="small-triangle-mask"><rect width="100%" height="100%" fill="white"></rect><polygon points="700.0 500.0, 400.00000000000006 326.7949192431122, 399.9999999999999 673.2050807568877" fill="black"></polygon></mask></defs><polygon points="1000.0 500.0, 250.0000000000001 66.98729810778059, 249.99999999999977 933.0127018922192" mask="url(#small-triangle-mask)" fill="white" class="ap-play-btn-fill"></polygon><polyline points="673.2050807568878 400.0, 326.7949192431123 600.0" stroke="white" stroke-width="90" class="ap-play-btn-stroke"></polyline></svg></span></div></div></div>`);
  var StartOverlay = (props => {
    const e = f => {
      return e => {
        e.preventDefault();
        f(e);
      };
    };
    return (() => {
      const _el$ = _tmpl$$3.cloneNode(true);
      addEventListener(_el$, "click", e(props.onClick), true);
      return _el$;
    })();
  });
  delegateEvents(["click"]);

  const _tmpl$$2 = /*#__PURE__*/template(`<div class="ap-overlay ap-overlay-help"><div><div><p>Keyboard shortcuts</p><ul><li><kbd>space</kbd> - pause / resume</li><li><kbd>f</kbd> - toggle fullscreen mode</li><li><kbd>←</kbd> / <kbd>→</kbd> - rewind / fast-forward by 5 seconds</li><li><kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> - rewind / fast-forward by 10%</li><li><kbd>k</kbd> - toggle keystroke popup</li><li><kbd>[</kbd> / <kbd>]</kbd> - jump to the previous / next marker</li><li><kbd>0</kbd>, <kbd>1</kbd>, <kbd>2</kbd> ... <kbd>9</kbd> - jump to 0%, 10%, 20% ... 90%</li><li><kbd>.</kbd> - step through a recording, one frame at a time (when paused)</li><li><kbd>?</kbd> - toggle this help popup</li></ul></div></div></div>`);
  var HelpOverlay = (props => {
    const style$1 = () => {
      return {
        "font-family": props.fontFamily
      };
    };
    const e = f => {
      return e => {
        e.preventDefault();
        f(e);
      };
    };
    return (() => {
      const _el$ = _tmpl$$2.cloneNode(true),
        _el$2 = _el$.firstChild;
      addEventListener(_el$, "click", e(props.onClose), true);
      _el$2.$$click = e => {
        e.stopPropagation();
      };
      createRenderEffect(_$p => style(_el$, style$1(), _$p));
      return _el$;
    })();
  });
  delegateEvents(["click"]);

  const _tmpl$$1 = /*#__PURE__*/template(`<div id="keystrokes" style><div><kbd></kbd></div></div>`);
  var KeystrokesOverlay = (props => {
    return (() => {
      const _el$ = _tmpl$$1.cloneNode(true),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild;
      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;
      insert(_el$3, () => props.keystroke);
      createRenderEffect(() => className(_el$, props.isKeystrokeFading ? "ap-overlay ap-overlay-keystrokes fading" : "ap-overlay ap-overlay-keystrokes"));
      return _el$;
    })();
  });

  const _tmpl$ = /*#__PURE__*/template(`<div class="ap-wrapper" tabindex="-1"><div></div></div>`);
  const CONTROL_BAR_HEIGHT = 32; // must match height of div.ap-control-bar in CSS

  var Player = (props => {
    const logger = props.logger;
    const core = props.core;
    const autoPlay = props.autoPlay;
    const [state, setState] = createStore({
      lines: [],
      cursor: undefined,
      charW: props.charW,
      charH: props.charH,
      bordersW: props.bordersW,
      bordersH: props.bordersH,
      containerW: 0,
      containerH: 0,
      isPausable: true,
      isSeekable: true,
      isFullscreen: false,
      currentTime: null,
      remainingTime: null,
      progress: null,
      blink: true,
      cursorHold: false,
      keystroke: null,
      hideKeystroke: props.hideKeystroke
    });
    const [isPlaying, setIsPlaying] = createSignal(false);
    const [overlay, setOverlay] = createSignal(!autoPlay ? "start" : null);
    const [infoMessage, setInfoMessage] = createSignal(null);
    const [terminalSize, setTerminalSize] = createSignal({
      cols: props.cols,
      rows: props.rows
    }, {
      equals: (newVal, oldVal) => newVal.cols === oldVal.cols && newVal.rows === oldVal.rows
    });
    const [duration, setDuration] = createSignal(undefined);
    const [markers, setMarkers] = createStore([]);
    const [userActive, setUserActive] = createSignal(false);
    const [isHelpVisible, setIsHelpVisible] = createSignal(false);
    const [originalTheme, setOriginalTheme] = createSignal(undefined);
    const terminalCols = createMemo(() => terminalSize().cols || 80);
    const terminalRows = createMemo(() => terminalSize().rows || 24);
    const controlBarHeight = () => props.controls === false ? 0 : CONTROL_BAR_HEIGHT;
    const [isKeystrokeVisible, setisKeystrokeVisible] = createSignal(false);
    const [isKeystrokeFading, setisKeyStrokeFading] = createSignal(false);
    const controlsVisible = () => props.controls === true || props.controls === "auto" && userActive();
    let frameRequestId;
    let userActivityTimeoutId;
    let timeUpdateIntervalId;
    let blinkIntervalId;
    let wrapperRef;
    let playerRef;
    let terminalRef;
    let controlBarRef;
    let resizeObserver;
    function onPlaying() {
      updateTerminal();
      startBlinking();
      startTimeUpdates();
    }
    function onStopped() {
      stopBlinking();
      stopTimeUpdates();
      updateTime();
    }
    function resize(size_) {
      batch(() => {
        if (size_.rows < terminalSize().rows) {
          setState("lines", state.lines.slice(0, size_.rows));
        }
        setTerminalSize(size_);
      });
    }
    function setPoster(poster) {
      if (poster !== undefined && !autoPlay) {
        setState({
          lines: poster.lines,
          cursor: poster.cursor
        });
      }
    }
    core.addEventListener("init", _ref => {
      let {
        cols,
        rows,
        duration,
        theme,
        poster,
        markers,
        hideKeystroke
      } = _ref;
      batch(() => {
        resize({
          cols,
          rows
        });
        setDuration(duration);
        setOriginalTheme(theme);
        setMarkers(markers);
        setPoster(poster);
        setisKeystrokeVisible(!hideKeystroke);
      });
    });
    core.addEventListener("play", () => {
      setOverlay(null);
      setisKeystrokeVisible(false);
    });
    core.addEventListener("playing", () => {
      batch(() => {
        setIsPlaying(true);
        setOverlay(null);
        onPlaying();
      });
    });
    core.addEventListener("idle", () => {
      batch(() => {
        setIsPlaying(false);
        onStopped();
      });
    });
    core.addEventListener("loading", () => {
      batch(() => {
        setIsPlaying(false);
        onStopped();
        setOverlay("loader");
        setisKeystrokeVisible(false);
      });
    });
    core.addEventListener("offline", _ref2 => {
      let {
        message
      } = _ref2;
      batch(() => {
        setIsPlaying(false);
        onStopped();
        if (message !== undefined) {
          setInfoMessage(message);
          setOverlay("info");
        }
      });
    });
    core.addEventListener("ended", _ref3 => {
      let {
        message
      } = _ref3;
      batch(() => {
        setIsPlaying(false);
        onStopped();
        setisKeystrokeVisible(false);
        if (message !== undefined) {
          setInfoMessage(message);
          setOverlay("info");
        }
      });
    });
    core.addEventListener("errored", () => {
      setOverlay("error");
    });
    core.addEventListener("input", _ref4 => {
      let {
        data
      } = _ref4;
      if (state.hideKeystroke) {
        return;
      }
      setisKeyStrokeFading(false);
      setTimeout(function () {
        setisKeyStrokeFading(true);
      }, 20);
      var pressed_key = printablekeypress(data, logger);
      if (pressed_key === "") {
        setisKeystrokeVisible(false);
      } else {
        setisKeystrokeVisible(true);
        setState("keystroke", pressed_key);
      }
    });
    core.addEventListener("resize", resize);
    core.addEventListener("reset", _ref5 => {
      let {
        cols,
        rows,
        theme
      } = _ref5;
      batch(() => {
        resize({
          cols,
          rows
        });
        setOriginalTheme(theme);
        updateTerminal();
      });
    });
    core.addEventListener("seeked", () => {
      updateTime();
      setisKeystrokeVisible(false);
    });
    core.addEventListener("terminalUpdate", () => {
      if (frameRequestId === undefined) {
        frameRequestId = requestAnimationFrame(updateTerminal);
      }
    });
    const setupResizeObserver = () => {
      resizeObserver = new ResizeObserver(debounce(_entries => {
        setState({
          containerW: wrapperRef.offsetWidth,
          containerH: wrapperRef.offsetHeight
        });
        wrapperRef.dispatchEvent(new CustomEvent("resize", {
          detail: {
            el: playerRef
          }
        }));
      }, 10));
      resizeObserver.observe(wrapperRef);
    };
    onMount(async () => {
      logger.info("player mounted");
      logger.debug("font measurements", {
        charW: state.charW,
        charH: state.charH
      });
      setupResizeObserver();
      const {
        isPausable,
        isSeekable,
        poster
      } = await core.init();
      batch(() => {
        setState({
          isPausable,
          isSeekable,
          containerW: wrapperRef.offsetWidth,
          containerH: wrapperRef.offsetHeight
        });
        setPoster(poster);
      });
      if (autoPlay) {
        core.play();
      }
    });
    onCleanup(() => {
      core.stop();
      stopBlinking();
      stopTimeUpdates();
      resizeObserver.disconnect();
    });
    const updateTerminal = () => {
      const changedLines = core.getChangedLines();
      batch(() => {
        if (changedLines) {
          changedLines.forEach((line, i) => {
            setState("lines", i, reconcile(line));
          });
        }
        setState("cursor", reconcile(core.getCursor()));
        setState("cursorHold", true);
      });
      frameRequestId = undefined;
    };
    const terminalElementSize = createMemo(() => {
      const terminalW = state.charW * terminalCols() + state.bordersW;
      const terminalH = state.charH * terminalRows() + state.bordersH;
      let fit = props.fit ?? "width";
      if (fit === "both" || state.isFullscreen) {
        const containerRatio = state.containerW / (state.containerH - controlBarHeight());
        const terminalRatio = terminalW / terminalH;
        if (containerRatio > terminalRatio) {
          fit = "height";
        } else {
          fit = "width";
        }
      }
      if (fit === false || fit === "none") {
        return {};
      } else if (fit === "width") {
        const scale = state.containerW / terminalW;
        return {
          scale: scale,
          width: state.containerW,
          height: terminalH * scale + controlBarHeight()
        };
      } else if (fit === "height") {
        const scale = (state.containerH - controlBarHeight()) / terminalH;
        return {
          scale: scale,
          width: terminalW * scale,
          height: state.containerH
        };
      } else {
        throw `unsupported fit mode: ${fit}`;
      }
    });
    const onFullscreenChange = () => {
      setState("isFullscreen", document.fullscreenElement ?? document.webkitFullscreenElement);
    };
    const toggleFullscreen = () => {
      if (state.isFullscreen) {
        (document.exitFullscreen ?? document.webkitExitFullscreen ?? (() => {})).apply(document);
      } else {
        (wrapperRef.requestFullscreen ?? wrapperRef.webkitRequestFullscreen ?? (() => {})).apply(wrapperRef);
      }
    };
    const onKeyDown = e => {
      if (e.altKey || e.metaKey || e.ctrlKey) {
        return;
      }
      if (e.key == " ") {
        core.togglePlay();
        setisKeyStrokeFading(false);
      } else if (e.key == ".") {
        core.step();
        updateTime();
      } else if (e.key == "f") {
        toggleFullscreen();
      } else if (e.key == "[") {
        core.seek({
          marker: "prev"
        });
      } else if (e.key == "]") {
        core.seek({
          marker: "next"
        });
      } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
        const pos = (e.key.charCodeAt(0) - 48) / 10;
        core.seek(`${pos * 100}%`);
      } else if (e.key == "?") {
        if (isHelpVisible()) {
          setIsHelpVisible(false);
        } else {
          core.pause();
          setIsHelpVisible(true);
        }
      } else if (e.key == "k") {
        if (state.hideKeystroke) {
          setState("hideKeystroke", false);
        } else {
          setisKeystrokeVisible(false);
          setState("hideKeystroke", true);
        }
      } else if (e.key == "ArrowLeft") {
        if (e.shiftKey) {
          core.seek("<<<");
        } else {
          core.seek("<<");
        }
      } else if (e.key == "ArrowRight") {
        if (e.shiftKey) {
          core.seek(">>>");
        } else {
          core.seek(">>");
        }
      } else if (e.key == "Escape") {
        setIsHelpVisible(false);
      } else {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    const wrapperOnMouseMove = () => {
      if (state.isFullscreen) {
        onUserActive(true);
      }
    };
    const playerOnMouseLeave = () => {
      if (!state.isFullscreen) {
        onUserActive(false);
      }
    };
    const startTimeUpdates = () => {
      timeUpdateIntervalId = setInterval(updateTime, 100);
    };
    const stopTimeUpdates = () => {
      clearInterval(timeUpdateIntervalId);
    };
    const updateTime = () => {
      const currentTime = core.getCurrentTime();
      const remainingTime = core.getRemainingTime();
      const progress = core.getProgress();
      setState({
        currentTime,
        remainingTime,
        progress
      });
    };
    const startBlinking = () => {
      blinkIntervalId = setInterval(() => {
        setState(state => {
          const changes = {
            blink: !state.blink
          };
          if (changes.blink) {
            changes.cursorHold = false;
          }
          return changes;
        });
      }, 500);
    };
    const stopBlinking = () => {
      clearInterval(blinkIntervalId);
      setState("blink", true);
    };
    const onUserActive = show => {
      clearTimeout(userActivityTimeoutId);
      if (show) {
        userActivityTimeoutId = setTimeout(() => onUserActive(false), 2000);
      }
      setUserActive(show);
    };
    const theme = createMemo(() => {
      const name = props.theme || "auto/asciinema";
      if (name.slice(0, 5) === "auto/") {
        return {
          name: name.slice(5),
          colors: originalTheme()
        };
      } else {
        return {
          name
        };
      }
    });
    const playerStyle = () => {
      const style = {};
      if ((props.fit === false || props.fit === "none") && props.terminalFontSize !== undefined) {
        if (props.terminalFontSize === "small") {
          style["font-size"] = "12px";
        } else if (props.terminalFontSize === "medium") {
          style["font-size"] = "18px";
        } else if (props.terminalFontSize === "big") {
          style["font-size"] = "24px";
        } else {
          style["font-size"] = props.terminalFontSize;
        }
      }
      const size = terminalElementSize();
      if (size.width !== undefined) {
        style["width"] = `${size.width}px`;
        style["height"] = `${size.height}px`;
      }
      const themeColors = theme().colors;
      if (themeColors !== undefined) {
        style["--term-color-foreground"] = themeColors.foreground;
        style["--term-color-background"] = themeColors.background;
        themeColors.palette.forEach((color, i) => {
          style[`--term-color-${i}`] = color;
        });
      }
      return style;
    };
    const playerClass = () => `ap-player asciinema-player-theme-${theme().name}`;
    const terminalScale = () => terminalElementSize()?.scale;
    const el = (() => {
      const _el$ = _tmpl$.cloneNode(true),
        _el$2 = _el$.firstChild;
      const _ref$ = wrapperRef;
      typeof _ref$ === "function" ? use(_ref$, _el$) : wrapperRef = _el$;
      _el$.addEventListener("webkitfullscreenchange", onFullscreenChange);
      _el$.addEventListener("fullscreenchange", onFullscreenChange);
      _el$.$$mousemove = wrapperOnMouseMove;
      _el$.$$keydown = onKeyDown;
      const _ref$2 = playerRef;
      typeof _ref$2 === "function" ? use(_ref$2, _el$2) : playerRef = _el$2;
      _el$2.$$mousemove = () => onUserActive(true);
      _el$2.addEventListener("mouseleave", playerOnMouseLeave);
      insert(_el$2, createComponent(Terminal, {
        get cols() {
          return terminalCols();
        },
        get rows() {
          return terminalRows();
        },
        get scale() {
          return terminalScale();
        },
        get blink() {
          return state.blink;
        },
        get lines() {
          return state.lines;
        },
        get cursor() {
          return state.cursor;
        },
        get cursorHold() {
          return state.cursorHold;
        },
        get fontFamily() {
          return props.terminalFontFamily;
        },
        get lineHeight() {
          return props.terminalLineHeight;
        },
        ref(r$) {
          const _ref$3 = terminalRef;
          typeof _ref$3 === "function" ? _ref$3(r$) : terminalRef = r$;
        }
      }), null);
      insert(_el$2, createComponent(Show, {
        get when() {
          return props.controls !== false;
        },
        get children() {
          return createComponent(ControlBar, {
            get duration() {
              return duration();
            },
            get currentTime() {
              return state.currentTime;
            },
            get remainingTime() {
              return state.remainingTime;
            },
            get progress() {
              return state.progress;
            },
            markers: markers,
            get isPlaying() {
              return isPlaying();
            },
            get isPausable() {
              return state.isPausable;
            },
            get isSeekable() {
              return state.isSeekable;
            },
            onPlayClick: () => core.togglePlay(),
            onFullscreenClick: toggleFullscreen,
            onSeekClick: pos => core.seek(pos),
            ref(r$) {
              const _ref$4 = controlBarRef;
              typeof _ref$4 === "function" ? _ref$4(r$) : controlBarRef = r$;
            }
          });
        }
      }), null);
      insert(_el$2, createComponent(Show, {
        get when() {
          return isKeystrokeVisible();
        },
        get children() {
          return createComponent(KeystrokesOverlay, {
            get fontFamily() {
              return props.terminalFontFamily;
            },
            get keystroke() {
              return state.keystroke;
            },
            get isKeystrokeFading() {
              return isKeystrokeFading();
            }
          });
        }
      }), null);
      insert(_el$2, createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return overlay() == "start";
            },
            get children() {
              return createComponent(StartOverlay, {
                onClick: () => core.play()
              });
            }
          }), createComponent(Match, {
            get when() {
              return overlay() == "loader";
            },
            get children() {
              return createComponent(LoaderOverlay, {});
            }
          }), createComponent(Match, {
            get when() {
              return overlay() == "info";
            },
            get children() {
              return createComponent(InfoOverlay, {
                get message() {
                  return infoMessage();
                },
                get fontFamily() {
                  return props.terminalFontFamily;
                }
              });
            }
          }), createComponent(Match, {
            get when() {
              return overlay() == "error";
            },
            get children() {
              return createComponent(ErrorOverlay, {});
            }
          })];
        }
      }), null);
      insert(_el$2, createComponent(Show, {
        get when() {
          return isHelpVisible();
        },
        get children() {
          return createComponent(HelpOverlay, {
            get fontFamily() {
              return props.terminalFontFamily;
            },
            onClose: () => setIsHelpVisible(false)
          });
        }
      }), null);
      createRenderEffect(_p$ => {
        const _v$ = !!controlsVisible(),
          _v$2 = playerClass(),
          _v$3 = playerStyle();
        _v$ !== _p$._v$ && _el$.classList.toggle("ap-hud", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && className(_el$2, _p$._v$2 = _v$2);
        _p$._v$3 = style(_el$2, _v$3, _p$._v$3);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });
      return _el$;
    })();
    return el;
  });
  delegateEvents(["keydown", "mousemove"]);

  class DummyLogger {
    log() {}
    debug() {}
    info() {}
    warn() {}
    error() {}
  }
  class PrefixedLogger {
    constructor(logger, prefix) {
      this.logger = logger;
      this.prefix = prefix;
    }
    log(message) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }
      this.logger.log(`${this.prefix}${message}`, ...args);
    }
    debug(message) {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }
      this.logger.debug(`${this.prefix}${message}`, ...args);
    }
    info(message) {
      for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
        args[_key3 - 1] = arguments[_key3];
      }
      this.logger.info(`${this.prefix}${message}`, ...args);
    }
    warn(message) {
      for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
        args[_key4 - 1] = arguments[_key4];
      }
      this.logger.warn(`${this.prefix}${message}`, ...args);
    }
    error(message) {
      for (var _len5 = arguments.length, args = new Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
        args[_key5 - 1] = arguments[_key5];
      }
      this.logger.error(`${this.prefix}${message}`, ...args);
    }
  }

  // Efficient array transformations without intermediate array objects.
  // Inspired by Elixir's streams and Rust's iterator adapters.

  class Stream {
    constructor(input, xfs) {
      this.input = typeof input.next === "function" ? input : input[Symbol.iterator]();
      this.xfs = xfs ?? [];
    }
    map(f) {
      return this.transform(Map$1(f));
    }
    flatMap(f) {
      return this.transform(FlatMap(f));
    }
    filter(f) {
      return this.transform(Filter(f));
    }
    take(n) {
      return this.transform(Take(n));
    }
    drop(n) {
      return this.transform(Drop(n));
    }
    transform(f) {
      return new Stream(this.input, this.xfs.concat([f]));
    }
    multiplex(other, comparator) {
      return new Stream(new Multiplexer(this[Symbol.iterator](), other[Symbol.iterator](), comparator));
    }
    toArray() {
      return Array.from(this);
    }
    [Symbol.iterator]() {
      let v = 0;
      let values = [];
      let flushed = false;
      const xf = compose(this.xfs, val => values.push(val));
      return {
        next: () => {
          if (v === values.length) {
            values = [];
            v = 0;
          }
          while (values.length === 0) {
            const next = this.input.next();
            if (next.done) {
              break;
            } else {
              xf.step(next.value);
            }
          }
          if (values.length === 0 && !flushed) {
            xf.flush();
            flushed = true;
          }
          if (values.length > 0) {
            return {
              done: false,
              value: values[v++]
            };
          } else {
            return {
              done: true
            };
          }
        }
      };
    }
  }
  function Map$1(f) {
    return emit => {
      return input => {
        emit(f(input));
      };
    };
  }
  function FlatMap(f) {
    return emit => {
      return input => {
        f(input).forEach(emit);
      };
    };
  }
  function Filter(f) {
    return emit => {
      return input => {
        if (f(input)) {
          emit(input);
        }
      };
    };
  }
  function Take(n) {
    let c = 0;
    return emit => {
      return input => {
        if (c < n) {
          emit(input);
        }
        c += 1;
      };
    };
  }
  function Drop(n) {
    let c = 0;
    return emit => {
      return input => {
        c += 1;
        if (c > n) {
          emit(input);
        }
      };
    };
  }
  function compose(xfs, push) {
    return xfs.reverse().reduce((next, curr) => {
      const xf = toXf(curr(next.step));
      return {
        step: xf.step,
        flush: () => {
          xf.flush();
          next.flush();
        }
      };
    }, toXf(push));
  }
  function toXf(xf) {
    if (typeof xf === "function") {
      return {
        step: xf,
        flush: () => {}
      };
    } else {
      return xf;
    }
  }
  class Multiplexer {
    constructor(left, right, comparator) {
      this.left = left;
      this.right = right;
      this.comparator = comparator;
    }
    [Symbol.iterator]() {
      let leftItem;
      let rightItem;
      return {
        next: () => {
          if (leftItem === undefined && this.left !== undefined) {
            const result = this.left.next();
            if (result.done) {
              this.left = undefined;
            } else {
              leftItem = result.value;
            }
          }
          if (rightItem === undefined && this.right !== undefined) {
            const result = this.right.next();
            if (result.done) {
              this.right = undefined;
            } else {
              rightItem = result.value;
            }
          }
          if (leftItem === undefined && rightItem === undefined) {
            return {
              done: true
            };
          } else if (leftItem === undefined) {
            const value = rightItem;
            rightItem = undefined;
            return {
              done: false,
              value: value
            };
          } else if (rightItem === undefined) {
            const value = leftItem;
            leftItem = undefined;
            return {
              done: false,
              value: value
            };
          } else if (this.comparator(leftItem, rightItem)) {
            const value = leftItem;
            leftItem = undefined;
            return {
              done: false,
              value: value
            };
          } else {
            const value = rightItem;
            rightItem = undefined;
            return {
              done: false,
              value: value
            };
          }
        }
      };
    }
  }

  async function parse$2(data) {
    let header;
    let events;
    if (data instanceof Response) {
      const text = await data.text();
      const result = parseJsonl(text);
      if (result !== undefined) {
        header = result.header;
        events = result.events;
      } else {
        header = JSON.parse(text);
      }
    } else if (typeof data === "object" && typeof data.version === "number") {
      header = data;
    } else if (Array.isArray(data)) {
      header = data[0];
      events = data.slice(1, data.length);
    } else {
      throw "invalid data";
    }
    if (header.version === 1) {
      return parseAsciicastV1(header);
    } else if (header.version === 2) {
      return parseAsciicastV2(header, events);
    } else {
      throw `asciicast v${header.version} format not supported`;
    }
  }
  function parseJsonl(jsonl) {
    const lines = jsonl.split("\n");
    let header;
    try {
      header = JSON.parse(lines[0]);
    } catch (_error) {
      return;
    }
    const events = new Stream(lines).drop(1).filter(l => l[0] === "[").map(JSON.parse).toArray();
    return {
      header,
      events
    };
  }
  function parseAsciicastV1(data) {
    let time = 0;
    const events = new Stream(data.stdout).map(e => {
      time += e[0];
      return [time, "o", e[1]];
    });
    return {
      cols: data.width,
      rows: data.height,
      events
    };
  }
  function parseAsciicastV2(header, events) {
    return {
      cols: header.width,
      rows: header.height,
      theme: parseTheme(header.theme),
      events,
      idleTimeLimit: header.idle_time_limit
    };
  }
  function parseTheme(theme) {
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    const paletteRegex = /^(#[0-9A-Fa-f]{6}:){7,}#[0-9A-Fa-f]{6}$/;
    const fg = theme?.fg;
    const bg = theme?.bg;
    const palette = theme?.palette;
    if (colorRegex.test(fg) && colorRegex.test(bg) && paletteRegex.test(palette)) {
      return {
        foreground: fg,
        background: bg,
        palette: palette.split(":")
      };
    }
  }
  function unparseAsciicastV2(recording) {
    const header = JSON.stringify({
      version: 2,
      width: recording.cols,
      height: recording.rows
    });
    const events = recording.events.map(JSON.stringify).join("\n");
    return `${header}\n${events}\n`;
  }

  function recording(src, _ref, _ref2) {
    let {
      feed,
      onInput,
      onMarker,
      now,
      setTimeout,
      setState,
      logger
    } = _ref;
    let {
      idleTimeLimit,
      startAt,
      loop,
      posterTime,
      markers: markers_,
      pauseOnMarkers,
      cols: initialCols,
      rows: initialRows
    } = _ref2;
    let cols;
    let rows;
    let events;
    let markers;
    let duration;
    let effectiveStartAt;
    let eventTimeoutId;
    let nextEventIndex = 0;
    let lastEventTime = 0;
    let startTime;
    let pauseElapsedTime;
    let playCount = 0;
    async function init() {
      const {
        parser,
        minFrameTime,
        inputOffset,
        dumpFilename,
        encoding = "utf-8"
      } = src;
      const recording = prepare(await parser(await doFetch(src), {
        encoding
      }), logger, {
        idleTimeLimit,
        startAt,
        minFrameTime,
        inputOffset,
        markers_
      });
      ({
        cols,
        rows,
        events,
        duration,
        effectiveStartAt
      } = recording);
      initialCols = initialCols ?? cols;
      initialRows = initialRows ?? rows;
      if (events.length === 0) {
        throw "recording is missing events";
      }
      if (dumpFilename !== undefined) {
        dump(recording, dumpFilename);
      }
      const poster = posterTime !== undefined ? getPoster(posterTime) : undefined;
      markers = events.filter(e => e[1] === "m").map(e => [e[0], e[2].label]);
      return {
        cols,
        rows,
        duration,
        theme: recording.theme,
        poster,
        markers
      };
    }
    function doFetch(_ref3) {
      let {
        url,
        data,
        fetchOpts = {}
      } = _ref3;
      if (typeof url === "string") {
        return doFetchOne(url, fetchOpts);
      } else if (Array.isArray(url)) {
        return Promise.all(url.map(url => doFetchOne(url, fetchOpts)));
      } else if (data !== undefined) {
        if (typeof data === "function") {
          data = data();
        }
        if (!(data instanceof Promise)) {
          data = Promise.resolve(data);
        }
        return data.then(value => {
          if (typeof value === "string" || value instanceof ArrayBuffer) {
            return new Response(value);
          } else {
            return value;
          }
        });
      } else {
        throw "failed fetching recording file: url/data missing in src";
      }
    }
    async function doFetchOne(url, fetchOpts) {
      const response = await fetch(url, fetchOpts);
      if (!response.ok) {
        throw `failed fetching recording from ${url}: ${response.status} ${response.statusText}`;
      }
      return response;
    }
    function delay(targetTime) {
      let delay = targetTime * 1000 - (now() - startTime);
      if (delay < 0) {
        delay = 0;
      }
      return delay;
    }
    function scheduleNextEvent() {
      const nextEvent = events[nextEventIndex];
      if (nextEvent) {
        eventTimeoutId = setTimeout(runNextEvent, delay(nextEvent[0]));
      } else {
        onEnd();
      }
    }
    function runNextEvent() {
      let event = events[nextEventIndex];
      let elapsedWallTime;
      do {
        lastEventTime = event[0];
        nextEventIndex++;
        const stop = executeEvent(event);
        if (stop) {
          return;
        }
        event = events[nextEventIndex];
        elapsedWallTime = now() - startTime;
      } while (event && elapsedWallTime > event[0] * 1000);
      scheduleNextEvent();
    }
    function cancelNextEvent() {
      clearTimeout(eventTimeoutId);
      eventTimeoutId = null;
    }
    function executeEvent(event) {
      const [time, type, data] = event;
      if (type === "o") {
        feed(data);
      } else if (type === "i") {
        onInput(data);
      } else if (type === "m") {
        onMarker(data);
        if (pauseOnMarkers) {
          pause();
          pauseElapsedTime = time * 1000;
          setState("idle", {
            reason: "paused"
          });
          return true;
        }
      }
      return false;
    }
    function onEnd() {
      cancelNextEvent();
      playCount++;
      if (loop === true || typeof loop === "number" && playCount < loop) {
        nextEventIndex = 0;
        startTime = now();
        feed("\x1bc"); // reset terminal
        resizeTerminalToInitialSize();
        scheduleNextEvent();
      } else {
        pauseElapsedTime = duration * 1000;
        setState("ended");
      }
    }
    function play() {
      if (eventTimeoutId) throw "already playing";
      if (events[nextEventIndex] === undefined) throw "already ended";
      if (effectiveStartAt !== null) {
        seek(effectiveStartAt);
      }
      resume();
      return true;
    }
    function pause() {
      if (!eventTimeoutId) return true;
      cancelNextEvent();
      pauseElapsedTime = now() - startTime;
      return true;
    }
    function resume() {
      startTime = now() - pauseElapsedTime;
      pauseElapsedTime = null;
      scheduleNextEvent();
    }
    function seek(where) {
      const isPlaying = !!eventTimeoutId;
      pause();
      const currentTime = (pauseElapsedTime ?? 0) / 1000;
      if (typeof where === "string") {
        if (where === "<<") {
          where = currentTime - 5;
        } else if (where === ">>") {
          where = currentTime + 5;
        } else if (where === "<<<") {
          where = currentTime - 0.1 * duration;
        } else if (where === ">>>") {
          where = currentTime + 0.1 * duration;
        } else if (where[where.length - 1] === "%") {
          where = parseFloat(where.substring(0, where.length - 1)) / 100 * duration;
        }
      } else if (typeof where === "object") {
        if (where.marker === "prev") {
          where = findMarkerTimeBefore(currentTime) ?? 0;
          if (isPlaying && currentTime - where < 1) {
            where = findMarkerTimeBefore(where) ?? 0;
          }
        } else if (where.marker === "next") {
          where = findMarkerTimeAfter(currentTime) ?? duration;
        } else if (typeof where.marker === "number") {
          const marker = markers[where.marker];
          if (marker === undefined) {
            throw `invalid marker index: ${where.marker}`;
          } else {
            where = marker[0];
          }
        }
      }
      const targetTime = Math.min(Math.max(where, 0), duration);
      if (targetTime < lastEventTime) {
        feed("\x1bc"); // reset terminal
        resizeTerminalToInitialSize();
        nextEventIndex = 0;
        lastEventTime = 0;
      }
      let event = events[nextEventIndex];
      while (event && event[0] <= targetTime) {
        if (event[1] === "o") {
          executeEvent(event);
        }
        lastEventTime = event[0];
        event = events[++nextEventIndex];
      }
      pauseElapsedTime = targetTime * 1000;
      effectiveStartAt = null;
      if (isPlaying) {
        resume();
      }
      return true;
    }
    function findMarkerTimeBefore(time) {
      if (markers.length == 0) return;
      let i = 0;
      let marker = markers[i];
      let lastMarkerTimeBefore;
      while (marker && marker[0] < time) {
        lastMarkerTimeBefore = marker[0];
        marker = markers[++i];
      }
      return lastMarkerTimeBefore;
    }
    function findMarkerTimeAfter(time) {
      if (markers.length == 0) return;
      let i = markers.length - 1;
      let marker = markers[i];
      let firstMarkerTimeAfter;
      while (marker && marker[0] > time) {
        firstMarkerTimeAfter = marker[0];
        marker = markers[--i];
      }
      return firstMarkerTimeAfter;
    }
    function step() {
      let nextEvent = events[nextEventIndex++];
      while (nextEvent !== undefined && nextEvent[1] !== "o") {
        nextEvent = events[nextEventIndex++];
      }
      if (nextEvent === undefined) return;
      feed(nextEvent[2]);
      const targetTime = nextEvent[0];
      lastEventTime = targetTime;
      pauseElapsedTime = targetTime * 1000;
      effectiveStartAt = null;
    }
    function restart() {
      if (eventTimeoutId) throw "still playing";
      if (events[nextEventIndex] !== undefined) throw "not ended";
      seek(0);
      resume();
      return true;
    }
    function getPoster(time) {
      return events.filter(e => e[0] < time && e[1] === "o").map(e => e[2]);
    }
    function getCurrentTime() {
      if (eventTimeoutId) {
        return (now() - startTime) / 1000;
      } else {
        return (pauseElapsedTime ?? 0) / 1000;
      }
    }
    function resizeTerminalToInitialSize() {
      feed(`\x1b[8;${initialRows};${initialCols};t`);
    }
    return {
      init,
      play,
      pause,
      seek,
      step,
      restart,
      stop: pause,
      getCurrentTime
    };
  }
  function batcher(logger) {
    let minFrameTime = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1.0 / 60;
    let prevEvent;
    return emit => {
      let ic = 0;
      let oc = 0;
      return {
        step: event => {
          ic++;
          if (prevEvent === undefined) {
            prevEvent = event;
            return;
          }
          if (event[1] === prevEvent[1] && event[0] - prevEvent[0] < minFrameTime) {
            if (event[1] === "m" && event[2] !== "") {
              prevEvent[2] = event[2];
            } else {
              prevEvent[2] += event[2];
            }
          } else {
            emit(prevEvent);
            prevEvent = event;
            oc++;
          }
        },
        flush: () => {
          if (prevEvent !== undefined) {
            emit(prevEvent);
            oc++;
          }
          logger.debug(`batched ${ic} frames to ${oc} frames`);
        }
      };
    };
  }
  function prepare(recording, logger, _ref4) {
    let {
      startAt = 0,
      idleTimeLimit,
      minFrameTime,
      inputOffset,
      markers_
    } = _ref4;
    let {
      events
    } = recording;
    if (events === undefined) {
      events = buildEvents(recording);
    }
    if (!(events instanceof Stream)) {
      events = new Stream(events);
    }
    idleTimeLimit = idleTimeLimit ?? recording.idleTimeLimit ?? Infinity;
    const limiterOutput = {
      offset: 0
    };
    events = events.map(convertResizeEvent).transform(batcher(logger, minFrameTime)).map(timeLimiter(idleTimeLimit, startAt, limiterOutput)).map(markerWrapper());
    if (markers_ !== undefined) {
      markers_ = new Stream(markers_).map(normalizeMarker);
      events = events.filter(e => e[1] !== "m").multiplex(markers_, (a, b) => a[0] < b[0]).map(markerWrapper());
    }
    events = events.toArray();
    if (inputOffset !== undefined) {
      events = events.map(e => e[1] === "i" ? [e[0] + inputOffset, e[1], e[2]] : e);
      events.sort((a, b) => a[0] - b[0]);
    }
    const duration = events[events.length - 1][0];
    const effectiveStartAt = startAt - limiterOutput.offset;
    return {
      ...recording,
      events,
      duration,
      effectiveStartAt
    };
  }
  function buildEvents(_ref5) {
    let {
      output = [],
      input = [],
      markers = []
    } = _ref5;
    const o = new Stream(output).map(e => [e[0], "o", e[1]]);
    const i = new Stream(input).map(e => [e[0], "i", e[1]]);
    const m = new Stream(markers).map(normalizeMarker);
    return o.multiplex(i, (a, b) => a[0] < b[0]).multiplex(m, (a, b) => a[0] < b[0]);
  }
  function convertResizeEvent(e) {
    if (e[1] === "r") {
      const [cols, rows] = e[2].split("x");
      return [e[0], "o", `\x1b[8;${rows};${cols};t`];
    } else {
      return e;
    }
  }
  function normalizeMarker(m) {
    return typeof m === "number" ? [m, "m", ""] : [m[0], "m", m[1]];
  }
  function timeLimiter(idleTimeLimit, startAt, output) {
    let prevT = 0;
    let shift = 0;
    return function (e) {
      const delay = e[0] - prevT;
      const delta = delay - idleTimeLimit;
      prevT = e[0];
      if (delta > 0) {
        shift += delta;
        if (e[0] < startAt) {
          output.offset += delta;
        }
      }
      return [e[0] - shift, e[1], e[2]];
    };
  }
  function markerWrapper() {
    let i = 0;
    return function (e) {
      if (e[1] === "m") {
        return [e[0], e[1], {
          index: i++,
          time: e[0],
          label: e[2]
        }];
      } else {
        return e;
      }
    };
  }
  function dump(recording, filename) {
    const link = document.createElement("a");
    const events = recording.events.map(e => e[1] === "m" ? [e[0], e[1], e[2].label] : e);
    const asciicast = unparseAsciicastV2({
      ...recording,
      events
    });
    link.href = URL.createObjectURL(new Blob([asciicast], {
      type: "text/plain"
    }));
    link.download = filename;
    link.click();
  }

  function clock(_ref, _ref2, _ref3) {
    let {
      hourColor = 3,
      minuteColor = 4,
      separatorColor = 9
    } = _ref;
    let {
      feed
    } = _ref2;
    let {
      cols = 5,
      rows = 1
    } = _ref3;
    const middleRow = Math.floor(rows / 2);
    const leftPad = Math.floor(cols / 2) - 2;
    const setupCursor = `\x1b[?25l\x1b[1m\x1b[${middleRow}B`;
    let intervalId;
    const getCurrentTime = () => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      const seqs = [];
      seqs.push("\r");
      for (let i = 0; i < leftPad; i++) {
        seqs.push(" ");
      }
      seqs.push(`\x1b[3${hourColor}m`);
      if (h < 10) {
        seqs.push("0");
      }
      seqs.push(`${h}`);
      seqs.push(`\x1b[3${separatorColor};5m:\x1b[25m`);
      seqs.push(`\x1b[3${minuteColor}m`);
      if (m < 10) {
        seqs.push("0");
      }
      seqs.push(`${m}`);
      return seqs;
    };
    const updateTime = () => {
      getCurrentTime().forEach(feed);
    };
    return {
      init: () => {
        const duration = 24 * 60;
        const poster = [setupCursor].concat(getCurrentTime());
        return {
          cols,
          rows,
          duration,
          poster
        };
      },
      play: () => {
        feed(setupCursor);
        updateTime();
        intervalId = setInterval(updateTime, 1000);
        return true;
      },
      stop: () => {
        clearInterval(intervalId);
      },
      getCurrentTime: () => {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
      }
    };
  }

  function random(src, _ref) {
    let {
      feed,
      setTimeout
    } = _ref;
    const base = " ".charCodeAt(0);
    const range = "~".charCodeAt(0) - base;
    let timeoutId;
    const schedule = () => {
      const t = Math.pow(5, Math.random() * 4);
      timeoutId = setTimeout(print, t);
    };
    const print = () => {
      schedule();
      const char = String.fromCharCode(base + Math.floor(Math.random() * range));
      feed(char);
    };
    return () => {
      schedule();
      return () => clearInterval(timeoutId);
    };
  }

  function benchmark(_ref, _ref2) {
    let {
      url,
      iterations = 10
    } = _ref;
    let {
      feed,
      setState,
      now
    } = _ref2;
    let data;
    let byteCount = 0;
    return {
      async init() {
        const recording = await parse$2(await fetch(url));
        const {
          cols,
          rows,
          events
        } = recording;
        data = Array.from(events).filter(_ref3 => {
          let [_time, type, _text] = _ref3;
          return type === "o";
        }).map(_ref4 => {
          let [time, _type, text] = _ref4;
          return [time, text];
        });
        const duration = data[data.length - 1][0];
        for (const [_, text] of data) {
          byteCount += new Blob([text]).size;
        }
        return {
          cols,
          rows,
          duration
        };
      },
      play() {
        const startTime = now();
        for (let i = 0; i < iterations; i++) {
          for (const [_, text] of data) {
            feed(text);
          }
          feed("\x1bc"); // reset terminal
        }

        const endTime = now();
        const duration = (endTime - startTime) / 1000;
        const throughput = byteCount * iterations / duration;
        const throughputMbs = byteCount / (1024 * 1024) * iterations / duration;
        console.info("benchmark: result", {
          byteCount,
          iterations,
          duration,
          throughput,
          throughputMbs
        });
        setTimeout(() => {
          setState("stopped", {
            reason: "ended"
          });
        }, 0);
        return true;
      }
    };
  }

  class Queue {
    constructor() {
      this.items = [];
      this.onPush = undefined;
    }
    push(item) {
      this.items.push(item);
      if (this.onPush !== undefined) {
        this.onPush(this.popAll());
        this.onPush = undefined;
      }
    }
    popAll() {
      if (this.items.length > 0) {
        const items = this.items;
        this.items = [];
        return items;
      } else {
        const thiz = this;
        return new Promise(resolve => {
          thiz.onPush = resolve;
        });
      }
    }
  }

  function getBuffer(bufferTime, feed, setTime, baseStreamTime, minFrameTime, logger) {
    if (bufferTime === 0) {
      logger.debug("using no buffer");
      return nullBuffer(feed);
    } else {
      bufferTime = bufferTime ?? {};
      let getBufferTime;
      if (typeof bufferTime === "number") {
        logger.debug(`using fixed time buffer (${bufferTime} ms)`);
        getBufferTime = _latency => bufferTime;
      } else if (typeof bufferTime === "function") {
        logger.debug("using custom dynamic buffer");
        getBufferTime = bufferTime({
          logger
        });
      } else {
        logger.debug("using adaptive buffer", bufferTime);
        getBufferTime = adaptiveBufferTimeProvider({
          logger
        }, bufferTime);
      }
      return buffer(getBufferTime, feed, setTime, logger, baseStreamTime ?? 0.0, minFrameTime);
    }
  }
  function nullBuffer(feed) {
    return {
      pushEvent(event) {
        if (event[1] === "o") {
          feed(event[2]);
        } else if (event[1] === "r") {
          const [cols, rows] = event[2].split("x");
          feed(`\x1b[8;${rows};${cols};t`);
        }
      },
      pushText(text) {
        feed(text);
      },
      stop() {}
    };
  }
  function buffer(getBufferTime, feed, setTime, logger, baseStreamTime) {
    let minFrameTime = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 1.0 / 60;
    let epoch = performance.now() - baseStreamTime * 1000;
    let bufferTime = getBufferTime(0);
    const queue = new Queue();
    minFrameTime *= 1000;
    let prevElapsedStreamTime = -minFrameTime;
    let stop = false;
    function elapsedWallTime() {
      return performance.now() - epoch;
    }
    setTimeout(async () => {
      while (!stop) {
        const events = await queue.popAll();
        if (stop) return;
        for (const event of events) {
          const elapsedStreamTime = event[0] * 1000 + bufferTime;
          if (elapsedStreamTime - prevElapsedStreamTime < minFrameTime) {
            feed(event[2]);
            continue;
          }
          const delay = elapsedStreamTime - elapsedWallTime();
          if (delay > 0) {
            await sleep(delay);
            if (stop) return;
          }
          setTime(event[0]);
          feed(event[2]);
          prevElapsedStreamTime = elapsedStreamTime;
        }
      }
    }, 0);
    return {
      pushEvent(event) {
        let latency = elapsedWallTime() - event[0] * 1000;
        if (latency < 0) {
          logger.debug(`correcting epoch by ${latency} ms`);
          epoch += latency;
          latency = 0;
        }
        bufferTime = getBufferTime(latency);
        if (event[1] === "o") {
          queue.push(event);
        } else if (event[1] === "r") {
          const [cols, rows] = event[2].split("x");
          queue.push([event[0], "o", `\x1b[8;${rows};${cols};t`]);
        }
      },
      pushText(text) {
        queue.push([elapsedWallTime(), "o", text]);
      },
      stop() {
        stop = true;
        queue.push(undefined);
      }
    };
  }
  function sleep(t) {
    return new Promise(resolve => {
      setTimeout(resolve, t);
    });
  }
  function adaptiveBufferTimeProvider(_ref, _ref2) {
    let {
      logger
    } = _ref;
    let {
      minTime = 25,
      maxLevel = 100,
      interval = 50,
      windowSize = 20,
      smoothingFactor = 0.2,
      minImprovementDuration = 1000
    } = _ref2;
    let bufferLevel = 0;
    let bufferTime = calcBufferTime(bufferLevel);
    let latencies = [];
    let maxJitter = 0;
    let jitterRange = 0;
    let improvementTs = null;
    function calcBufferTime(level) {
      if (level === 0) {
        return minTime;
      } else {
        return interval * level;
      }
    }
    return latency => {
      latencies.push(latency);
      if (latencies.length < windowSize) {
        return bufferTime;
      }
      latencies = latencies.slice(-windowSize);
      const currentMinJitter = min(latencies);
      const currentMaxJitter = max(latencies);
      const currentJitterRange = currentMaxJitter - currentMinJitter;
      maxJitter = currentMaxJitter * smoothingFactor + maxJitter * (1 - smoothingFactor);
      jitterRange = currentJitterRange * smoothingFactor + jitterRange * (1 - smoothingFactor);
      const minBufferTime = maxJitter + jitterRange;
      if (latency > bufferTime) {
        logger.debug('buffer underrun', {
          latency,
          maxJitter,
          jitterRange,
          bufferTime
        });
      }
      if (bufferLevel < maxLevel && minBufferTime > bufferTime) {
        bufferTime = calcBufferTime(bufferLevel += 1);
        logger.debug(`jitter increased, raising bufferTime`, {
          latency,
          maxJitter,
          jitterRange,
          bufferTime
        });
      } else if (bufferLevel > 1 && minBufferTime < calcBufferTime(bufferLevel - 2) || bufferLevel == 1 && minBufferTime < calcBufferTime(bufferLevel - 1)) {
        if (improvementTs === null) {
          improvementTs = performance.now();
        } else if (performance.now() - improvementTs > minImprovementDuration) {
          improvementTs = performance.now();
          bufferTime = calcBufferTime(bufferLevel -= 1);
          logger.debug(`jitter decreased, lowering bufferTime`, {
            latency,
            maxJitter,
            jitterRange,
            bufferTime
          });
        }
        return bufferTime;
      }
      improvementTs = null;
      return bufferTime;
    };
  }
  function min(numbers) {
    return numbers.reduce((prev, cur) => cur < prev ? cur : prev);
  }
  function max(numbers) {
    return numbers.reduce((prev, cur) => cur > prev ? cur : prev);
  }

  function exponentialDelay(attempt) {
    return Math.min(500 * Math.pow(2, attempt), 5000);
  }
  function websocket(_ref, _ref2) {
    let {
      url,
      bufferTime,
      reconnectDelay = exponentialDelay,
      minFrameTime
    } = _ref;
    let {
      feed,
      reset,
      setState,
      logger
    } = _ref2;
    logger = new PrefixedLogger(logger, "websocket: ");
    const utfDecoder = new TextDecoder();
    let socket;
    let buf;
    let clock = new NullClock();
    let reconnectAttempt = 0;
    let successfulConnectionTimeout;
    let stop = false;
    let wasOnline = false;
    function initBuffer(baseStreamTime) {
      if (buf !== undefined) buf.stop();
      buf = getBuffer(bufferTime, feed, t => clock.setTime(t), baseStreamTime, minFrameTime, logger);
    }
    function detectProtocol(event) {
      if (typeof event.data === "string") {
        logger.info("activating asciicast-compatible handler");
        initBuffer();
        socket.onmessage = handleJsonMessage;
        handleJsonMessage(event);
      } else {
        const arr = new Uint8Array(event.data);
        if (arr[0] == 0x41 && arr[1] == 0x4c && arr[2] == 0x69 && arr[3] == 0x53) {
          // 'ALiS'
          if (arr[4] == 1) {
            logger.info("activating ALiS v1 handler");
            socket.onmessage = handleStreamMessage;
          } else {
            logger.warn(`unsupported ALiS version (${arr[4]})`);
            socket.close();
          }
        } else {
          logger.info("activating raw text handler");
          initBuffer();
          const text = utfDecoder.decode(arr);
          const size = sizeFromResizeSeq(text) ?? sizeFromScriptStartMessage(text);
          if (size !== undefined) {
            const [cols, rows] = size;
            handleResetMessage(cols, rows, 0, undefined);
          }
          socket.onmessage = handleRawTextMessage;
          handleRawTextMessage(event);
        }
      }
    }
    function sizeFromResizeSeq(text) {
      const match = text.match(/\x1b\[8;(\d+);(\d+)t/);
      if (match !== null) {
        return [parseInt(match[2], 10), parseInt(match[1], 10)];
      }
    }
    function sizeFromScriptStartMessage(text) {
      const match = text.match(/\[.*COLUMNS="(\d{1,3})" LINES="(\d{1,3})".*\]/);
      if (match !== null) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)];
      }
    }
    function handleJsonMessage(event) {
      const e = JSON.parse(event.data);
      if (Array.isArray(e)) {
        buf.pushEvent(e);
      } else if (e.cols !== undefined || e.width !== undefined) {
        handleResetMessage(e.cols ?? e.width, e.rows ?? e.height, e.time, e.init ?? undefined);
      } else if (e.status === "offline") {
        handleOfflineMessage();
      }
    }
    const THEME_LEN = 54; // (2 + 16) * 3

    function handleStreamMessage(event) {
      const buffer = event.data;
      const view = new DataView(buffer);
      const type = view.getUint8(0);
      let offset = 1;
      if (type === 0x01) {
        // reset
        const cols = view.getUint16(offset, true);
        offset += 2;
        const rows = view.getUint16(offset, true);
        offset += 2;
        const time = view.getFloat32(offset, true);
        offset += 4;
        const themeFormat = view.getUint8(offset);
        offset += 1;
        let theme;
        if (themeFormat === 1) {
          theme = parseTheme(new Uint8Array(buffer, offset, THEME_LEN));
          offset += THEME_LEN;
        }
        const initLen = view.getUint32(offset, true);
        offset += 4;
        let init;
        if (initLen > 0) {
          init = utfDecoder.decode(new Uint8Array(buffer, offset, initLen));
          offset += initLen;
        }
        handleResetMessage(cols, rows, time, init, theme);
      } else if (type === 0x6f) {
        // 'o' - output
        const time = view.getFloat32(1, true);
        const len = view.getUint32(5, true);
        const text = utfDecoder.decode(new Uint8Array(buffer, 9, len));
        buf.pushEvent([time, "o", text]);
      } else if (type === 0x72) {
        // 'r' - resize
        const time = view.getFloat32(1, true);
        const cols = view.getUint16(5, true);
        const rows = view.getUint16(7, true);
        buf.pushEvent([time, "r", `${cols}x${rows}`]);
      } else if (type === 0x04) {
        // offline (EOT)
        handleOfflineMessage();
      } else {
        logger.debug(`unknown frame type: ${type}`);
      }
    }
    function parseTheme(arr) {
      const foreground = hexColor(arr[0], arr[1], arr[2]);
      const background = hexColor(arr[3], arr[4], arr[5]);
      const palette = [];
      for (let i = 0; i < 16; i++) {
        palette.push(hexColor(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]));
      }
      return {
        foreground,
        background,
        palette
      };
    }
    function hexColor(r, g, b) {
      return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
    }
    function byteToHex(value) {
      return value.toString(16).padStart(2, "0");
    }
    function handleRawTextMessage(event) {
      buf.pushText(utfDecoder.decode(event.data));
    }
    function handleResetMessage(cols, rows, time, init, theme) {
      logger.debug(`stream reset (${cols}x${rows} @${time})`);
      setState("playing");
      initBuffer(time);
      reset(cols, rows, init, theme);
      clock = new Clock();
      wasOnline = true;
      if (typeof time === "number") {
        clock.setTime(time);
      }
    }
    function handleOfflineMessage() {
      logger.info("stream offline");
      if (wasOnline) {
        setState("offline", {
          message: "Stream ended"
        });
      } else {
        setState("offline", {
          message: "Stream offline"
        });
      }
      clock = new NullClock();
    }
    function connect() {
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        logger.info("opened");
        successfulConnectionTimeout = setTimeout(() => {
          reconnectAttempt = 0;
        }, 1000);
      };
      socket.onmessage = detectProtocol;
      socket.onclose = event => {
        if (stop || event.code === 1000 || event.code === 1005) {
          logger.info("closed");
          setState("ended", {
            message: "Stream ended"
          });
        } else {
          clearTimeout(successfulConnectionTimeout);
          const delay = reconnectDelay(reconnectAttempt++);
          logger.info(`unclean close, reconnecting in ${delay}...`);
          setState("loading");
          setTimeout(connect, delay);
        }
      };
      wasOnline = false;
    }
    return {
      play: () => {
        connect();
      },
      stop: () => {
        stop = true;
        if (buf !== undefined) buf.stop();
        if (socket !== undefined) socket.close();
      },
      getCurrentTime: () => clock.getTime()
    };
  }

  function eventsource(_ref, _ref2) {
    let {
      url,
      bufferTime,
      minFrameTime
    } = _ref;
    let {
      feed,
      reset,
      setState,
      logger
    } = _ref2;
    logger = new PrefixedLogger(logger, "eventsource: ");
    let es;
    let buf;
    let clock = new NullClock();
    function initBuffer(baseStreamTime) {
      if (buf !== undefined) buf.stop();
      buf = getBuffer(bufferTime, feed, t => clock.setTime(t), baseStreamTime, minFrameTime, logger);
    }
    return {
      play: () => {
        es = new EventSource(url);
        es.addEventListener("open", () => {
          logger.info("opened");
          initBuffer();
        });
        es.addEventListener("error", e => {
          logger.info("errored");
          logger.debug({
            e
          });
          setState("loading");
        });
        es.addEventListener("message", event => {
          const e = JSON.parse(event.data);
          if (Array.isArray(e)) {
            buf.pushEvent(e);
          } else if (e.cols !== undefined || e.width !== undefined) {
            const cols = e.cols ?? e.width;
            const rows = e.rows ?? e.height;
            logger.debug(`vt reset (${cols}x${rows})`);
            setState("playing");
            initBuffer(e.time);
            reset(cols, rows, e.init ?? undefined);
            clock = new Clock();
            if (typeof e.time === "number") {
              clock.setTime(e.time);
            }
          } else if (e.state === "offline") {
            logger.info("stream offline");
            setState("offline", {
              message: "Stream offline"
            });
            clock = new NullClock();
          }
        });
        es.addEventListener("done", () => {
          logger.info("closed");
          es.close();
          setState("ended", {
            message: "Stream ended"
          });
        });
      },
      stop: () => {
        if (buf !== undefined) buf.stop();
        if (es !== undefined) es.close();
      },
      getCurrentTime: () => clock.getTime()
    };
  }

  async function parse$1(responses, _ref) {
    let {
      encoding
    } = _ref;
    const textDecoder = new TextDecoder(encoding);
    let cols;
    let rows;
    let timing = (await responses[0].text()).split("\n").filter(line => line.length > 0).map(line => line.split(" "));
    if (timing[0].length < 3) {
      timing = timing.map(entry => ["O", entry[0], entry[1]]);
    }
    const buffer = await responses[1].arrayBuffer();
    const array = new Uint8Array(buffer);
    const dataOffset = array.findIndex(byte => byte == 0x0a) + 1;
    const header = textDecoder.decode(array.subarray(0, dataOffset));
    const sizeMatch = header.match(/COLUMNS="(\d+)" LINES="(\d+)"/);
    if (sizeMatch !== null) {
      cols = parseInt(sizeMatch[1], 10);
      rows = parseInt(sizeMatch[2], 10);
    }
    const stdout = {
      array,
      cursor: dataOffset
    };
    let stdin = stdout;
    if (responses[2] !== undefined) {
      const buffer = await responses[2].arrayBuffer();
      const array = new Uint8Array(buffer);
      stdin = {
        array,
        cursor: dataOffset
      };
    }
    const events = [];
    let time = 0;
    for (const entry of timing) {
      time += parseFloat(entry[1]);
      if (entry[0] === "O") {
        const count = parseInt(entry[2], 10);
        const bytes = stdout.array.subarray(stdout.cursor, stdout.cursor + count);
        const text = textDecoder.decode(bytes);
        events.push([time, "o", text]);
        stdout.cursor += count;
      } else if (entry[0] === "I") {
        const count = parseInt(entry[2], 10);
        const bytes = stdin.array.subarray(stdin.cursor, stdin.cursor + count);
        const text = textDecoder.decode(bytes);
        events.push([time, "i", text]);
        stdin.cursor += count;
      } else if (entry[0] === "S" && entry[2] === "SIGWINCH") {
        const cols = parseInt(entry[4].slice(5), 10);
        const rows = parseInt(entry[3].slice(5), 10);
        events.push([time, "r", `${cols}x${rows}`]);
      } else if (entry[0] === "H" && entry[2] === "COLUMNS") {
        cols = parseInt(entry[3], 10);
      } else if (entry[0] === "H" && entry[2] === "LINES") {
        rows = parseInt(entry[3], 10);
      }
    }
    cols = cols ?? 80;
    rows = rows ?? 24;
    return {
      cols,
      rows,
      events
    };
  }

  async function parse(response, _ref) {
    let {
      encoding
    } = _ref;
    const textDecoder = new TextDecoder(encoding);
    const buffer = await response.arrayBuffer();
    const array = new Uint8Array(buffer);
    const firstFrame = parseFrame(array);
    const baseTime = firstFrame.time;
    const firstFrameText = textDecoder.decode(firstFrame.data);
    const sizeMatch = firstFrameText.match(/\x1b\[8;(\d+);(\d+)t/);
    const events = [];
    let cols = 80;
    let rows = 24;
    if (sizeMatch !== null) {
      cols = parseInt(sizeMatch[2], 10);
      rows = parseInt(sizeMatch[1], 10);
    }
    let cursor = 0;
    let frame = parseFrame(array);
    while (frame !== undefined) {
      const time = frame.time - baseTime;
      const text = textDecoder.decode(frame.data);
      events.push([time, "o", text]);
      cursor += frame.len;
      frame = parseFrame(array.subarray(cursor));
    }
    return {
      cols,
      rows,
      events
    };
  }
  function parseFrame(array) {
    if (array.length < 13) return;
    const time = parseTimestamp(array.subarray(0, 8));
    const len = parseNumber(array.subarray(8, 12));
    const data = array.subarray(12, 12 + len);
    return {
      time,
      data,
      len: len + 12
    };
  }
  function parseNumber(array) {
    return array[0] + array[1] * 256 + array[2] * 256 * 256 + array[3] * 256 * 256 * 256;
  }
  function parseTimestamp(array) {
    const sec = parseNumber(array.subarray(0, 4));
    const usec = parseNumber(array.subarray(4, 8));
    return sec + usec / 1000000;
  }

  const drivers = new Map([["benchmark", benchmark], ["clock", clock], ["eventsource", eventsource], ["random", random], ["recording", recording], ["websocket", websocket]]);
  const parsers = new Map([["asciicast", parse$2], ["typescript", parse$1], ["ttyrec", parse]]);
  function create(src, elem) {
    let opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    const logger = opts.logger ?? new DummyLogger();
    const core = new Core(getDriver(src), {
      logger: logger,
      cols: opts.cols,
      rows: opts.rows,
      loop: opts.loop,
      speed: opts.speed,
      preload: opts.preload,
      startAt: opts.startAt,
      poster: opts.poster,
      markers: opts.markers,
      pauseOnMarkers: opts.pauseOnMarkers,
      idleTimeLimit: opts.idleTimeLimit,
      hideKeystroke: opts.hideKeystroke
    });
    const metrics = measureTerminal(opts.terminalFontFamily, opts.terminalLineHeight);
    const props = {
      logger: logger,
      core: core,
      cols: opts.cols,
      rows: opts.rows,
      fit: opts.fit,
      controls: opts.controls ?? "auto",
      autoPlay: opts.autoPlay ?? opts.autoplay,
      terminalFontSize: opts.terminalFontSize,
      terminalFontFamily: opts.terminalFontFamily,
      terminalLineHeight: opts.terminalLineHeight,
      theme: opts.theme,
      hideKeystroke: opts.hideKeystroke ?? false,
      ...metrics
    };
    let el;
    const dispose = render(() => {
      el = createComponent(Player, props);
      return el;
    }, elem);
    const player = {
      el: el,
      dispose: dispose,
      getCurrentTime: () => core.getCurrentTime(),
      getDuration: () => core.getDuration(),
      play: () => core.play(),
      pause: () => core.pause(),
      seek: pos => core.seek(pos)
    };
    player.addEventListener = (name, callback) => {
      return core.addEventListener(name, callback.bind(player));
    };
    return player;
  }
  function getDriver(src) {
    if (typeof src === "function") return src;
    if (typeof src === "string") {
      if (src.substring(0, 5) == "ws://" || src.substring(0, 6) == "wss://") {
        src = {
          driver: "websocket",
          url: src
        };
      } else if (src.substring(0, 6) == "clock:") {
        src = {
          driver: "clock"
        };
      } else if (src.substring(0, 7) == "random:") {
        src = {
          driver: "random"
        };
      } else if (src.substring(0, 10) == "benchmark:") {
        src = {
          driver: "benchmark",
          url: src.substring(10)
        };
      } else {
        src = {
          driver: "recording",
          url: src
        };
      }
    }
    if (src.driver === undefined) {
      src.driver = "recording";
    }
    if (src.driver == "recording") {
      if (src.parser === undefined) {
        src.parser = "asciicast";
      }
      if (typeof src.parser === "string") {
        if (parsers.has(src.parser)) {
          src.parser = parsers.get(src.parser);
        } else {
          throw `unknown parser: ${src.parser}`;
        }
      }
    }
    if (drivers.has(src.driver)) {
      const driver = drivers.get(src.driver);
      return (callbacks, opts) => driver(src, callbacks, opts);
    } else {
      throw `unsupported driver: ${JSON.stringify(src)}`;
    }
  }
  function measureTerminal(fontFamily, lineHeight) {
    const cols = 80;
    const rows = 24;
    const div = document.createElement("div");
    div.style.height = "0px";
    div.style.overflow = "hidden";
    div.style.fontSize = "15px"; // must match font-size of div.asciinema-player in CSS
    document.body.appendChild(div);
    let el;
    const dispose = render(() => {
      el = createComponent(Terminal, {
        cols: cols,
        rows: rows,
        lineHeight: lineHeight,
        fontFamily: fontFamily,
        lines: []
      });
      return el;
    }, div);
    const metrics = {
      charW: el.clientWidth / cols,
      charH: el.clientHeight / rows,
      bordersW: el.offsetWidth - el.clientWidth,
      bordersH: el.offsetHeight - el.clientHeight
    };
    dispose();
    document.body.removeChild(div);
    return metrics;
  }

  exports.create = create;

  return exports;

})({});
