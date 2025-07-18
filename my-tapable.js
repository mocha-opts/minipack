class Hook {
  constructor(args = []) {
    this._args = args;
    this.taps = [];
    this.interceptors = [];
  }

  tap(name, fn) {
    this.taps.push({ name, fn, type: "sync" });
  }

  tapAsync(name, fn) {
    this.taps.push({ name, fn, type: "async" });
  }

  tapPromise(name, fn) {
    this.taps.push({ name, fn, type: "promise" });
  }

  intercept(interceptor) {
    this.interceptors.push(interceptor);
  }

  _createCall(type) {
    return (...args) => {
      let callback = () => {};
      if (type === "async") {
        callback = args.pop() || (() => {});
      }

      // 执行拦截器
      this.interceptors.forEach((interceptor) => {
        if (interceptor.call) interceptor.call(...args);
      });

      let currentPos = 0;
      const next = (err, result) => {
        if (err) return this._handleError(type, err, callback);

        // 所有钩子执行完毕
        if (currentPos >= this.taps.length) {
          return this._finalCallback(type, result, callback);
        }

        const tap = this.taps[currentPos++];

        // 执行拦截器
        this.interceptors.forEach((interceptor) => {
          if (interceptor.tap) interceptor.tap(tap);
        });

        try {
          switch (tap.type) {
            case "sync":
              const syncResult = tap.fn(...args);
              return next(null, syncResult);

            case "async":
              return tap.fn(...args, (err, result) => next(err, result));

            case "promise":
              return tap
                .fn(...args)
                .then((res) => next(null, res))
                .catch((err) => next(err));
          }
        } catch (err) {
          next(err);
        }
      };

      next();
    };
  }

  _handleError(type, err, callback) {
    if (type === "async") return callback(err);
    if (type === "promise") return Promise.reject(err);
    throw err;
  }

  _finalCallback(type, result, callback) {
    if (type === "async") return callback(null, result);
    if (type === "promise") return Promise.resolve(result);
    return result;
  }
}

class SyncHook extends Hook {
  call(...args) {
    return this._createCall("sync")(...args);
  }
}

class AsyncSeriesHook extends Hook {
  callAsync(...args) {
    return this._createCall("async")(...args);
  }

  promise(...args) {
    return this._createCall("promise")(...args);
  }
}

module.exports = {
  SyncHook,
  AsyncSeriesHook,
};
