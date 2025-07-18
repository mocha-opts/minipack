const fs = require("fs");
const path = require("path");
const { SyncHook, AsyncSeriesHook } = require("./my-tapable");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const t = require("@babel/types");

class MiniPack {
  constructor(config) {
    this.config = {
      ...config,
      entry: path.resolve(config.entry),
      output: {
        ...config.output,
        path: path.resolve(config.output.path),
      },
    };
    console.log(
      "✅ 注册的插件:",
      config.plugins.map((p) => p.constructor.name)
    ); // 调试日志

    this.modules = new Map();
    this.assets = {};
    this.moduleId = 0;

    this.hooks = {
      beforeRun: new AsyncSeriesHook(["compiler"]),
      beforeParse: new AsyncSeriesHook(["filename", "content"]),
      afterParse: new AsyncSeriesHook(["filename", "ast"]),
      afterCompile: new AsyncSeriesHook(["modules"]),
      emit: new AsyncSeriesHook(["assets"]),
      done: new SyncHook(["stats"]),
    };

    this.hooks.beforeRun.intercept({
      call: () => console.log(">>> beforeRun 钩子被调用"),
      tap: (tapInfo) => console.log(`插件 ${tapInfo.name} 注册到 beforeRun`),
    });

    if (config.plugins) {
      config.plugins.forEach((plugin) => {
        console.log(`🛠️ 正在应用插件: ${plugin.constructor.name}`); // 调试日志
        plugin.apply(this);
      });
    }
  }

  async run() {
    try {
      console.log("⏳ 准备执行 beforeRun 钩子");
      await this.hooks.beforeRun.promise(this); // 确保等待钩子完成

      console.log("⏳ 开始构建依赖图");
      const entryModule = await this.createModule(
        path.resolve(this.config.entry)
      );
      await this.buildDependencyGraph(entryModule);

      console.log("⏳ 准备执行 afterCompile 钩子");
      await this.hooks.afterCompile.promise(this.modules);

      this.assets["bundle.js"] = this.generateBundle();

      console.log("⏳ 准备执行 emit 钩子");
      await this.hooks.emit.promise(this.assets);

      this.emitFiles();

      console.log("⏳ 准备执行 done 钩子");
      this.hooks.done.call({
        time: Date.now(),
        modules: this.modules.size,
      });
    } catch (err) {
      console.error("❌ 构建流程错误:", err);
      process.exit(1);
    }
  }

  async createModule(filename) {
    try {
      console.log(`📂 正在处理文件: ${filename}`);
      if (!fs.existsSync(filename)) {
        throw new Error(`文件不存在: ${filename}`);
      }

      const content = fs.readFileSync(filename, "utf-8");
      await this.hooks.beforeParse.promise(filename, content);

      // 解析为 AST
      const ast = parser.parse(content, {
        sourceType: "module",
        plugins: ["dynamicImport", "importMeta", "exportDefaultFrom"],
        allowUndeclaredExports: true,
      });

      await this.hooks.afterParse.promise(filename, ast);

      const dependencies = new Set();
      traverse(ast, {
        ImportDeclaration: ({ node }) => {
          try {
            const depPath = this._resolveDependency(
              path.dirname(filename),
              node.source.value
            );
            console.log(`➕ 添加依赖: ${filename} -> ${depPath}`); // 调试日志
            dependencies.add(depPath);
          } catch (err) {
            console.error(`❌ 依赖解析失败: ${filename}`, err);
          }
        },
        CallExpression: ({ node }) => {
          if (
            t.isIdentifier(node.callee, { name: "require" }) &&
            t.isStringLiteral(node.arguments[0])
          ) {
            try {
              const depPath = this._resolveDependency(
                path.dirname(filename),
                node.arguments[0].value
              );
              console.log(`➕ 添加require依赖: ${filename} -> ${depPath}`); // 调试日志
              dependencies.add(depPath);
            } catch (err) {
              console.error(`❌ require解析失败: ${filename}`, err);
            }
          }
        },
      });

      const { code } = generator(ast);
      const module = {
        id: this.moduleId++,
        filename,
        dependencies: Array.from(dependencies),
        code: this.wrapModuleCode(code),
      };

      this.modules.set(filename, module);
      return module;
    } catch (err) {
      console.error(`💥 创建模块失败: ${filename}`, err);
      throw err; // 确保错误向上传播
    }
  }
  // 添加新方法
  _resolveDependency(dirname, request) {
    // 尝试自动补全扩展名
    const exts = [".js", ".json", ".node"];
    for (const ext of exts) {
      const fullPath = path.resolve(dirname, request + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // 尝试作为目录下的 index.js
    const indexPath = path.resolve(dirname, request, "index.js");
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }

    // 最后尝试原始路径
    const rawPath = path.resolve(dirname, request);
    if (fs.existsSync(rawPath)) {
      return rawPath;
    }

    throw new Error(`无法解析依赖: ${request} in ${dirname}`);
  }
  wrapModuleCode(code) {
    return `function(require, module, exports) {
      ${code}
    }`;
  }

  async buildDependencyGraph(entryModule) {
    const queue = [entryModule];

    for (const module of queue) {
      for (const dep of module.dependencies) {
        if (!this.modules.has(dep)) {
          console.log(`🔍 正在加载依赖: ${dep}`);
          try {
            const depModule = await this.createModule(dep);
            queue.push(depModule);
          } catch (err) {
            console.error(`❌ 加载依赖失败: ${dep}`);
            console.error(err.message);
            process.exit(1);
          }
        }
      }
    }
  }

  generateBundle() {
    // let modules = "";
    // this.modules.forEach((mod) => {
    //   modules += `${mod.id}: [
    //     ${mod.code},
    //     ${JSON.stringify(
    //       mod.dependencies.reduce((map, dep) => {
    //         map[path.relative(path.dirname(mod.filename), dep)] =
    //           this.modules.get(dep).id;
    //         return map;
    //       }, {})
    //     )}
    //   ],`;
    // });
    let modules = "";
    this.modules.forEach((mod) => {
      const dependencyMap = mod.dependencies.reduce((map, dep) => {
        let relativePath = path
          .relative(path.dirname(mod.filename), dep)
          .replace(/\\/g, "/"); // 兼容 windows
        if (!relativePath.startsWith(".")) {
          relativePath = "./" + relativePath; // 确保是相对路径引用
        }
        map[relativePath] = this.modules.get(dep).id;
        return map;
      }, {});

      modules += `${mod.id}: [
            ${mod.code},
            ${JSON.stringify(dependencyMap)}
        ],`;
    });

    return `(function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(relativePath) {
          return require(mapping[relativePath]);
        }

        const module = { exports: {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }

      require(0);
    })({${modules}})`;
  }

  emitFiles() {
    const outputPath = path.resolve(this.config.output.path);
    if (!fs.existsSync(outputPath))
      fs.mkdirSync(outputPath, { recursive: true });

    Object.keys(this.assets).forEach((filename) => {
      fs.writeFileSync(path.join(outputPath, filename), this.assets[filename]);
    });
  }
}

// 配置和运行
const LoggerPlugin = require("./plugins/LoggerPlugin");
const OptimizerPlugin = require("./plugins/OptimizerPlugin");
const ASTAnalyzerPlugin = require("./plugins/ASTAnalyzerPlugin");

const config = {
  entry: "./src/index.js",
  output: {
    path: "./dist",
    filename: "bundle.js",
  },
  plugins: [new LoggerPlugin(), new OptimizerPlugin(), new ASTAnalyzerPlugin()],
};

const compiler = new MiniPack(config);
compiler.run().catch((err) => console.error(err));
