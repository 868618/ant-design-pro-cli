const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const execa = require('execa');
const rimraf = require('rimraf');
const getNpmRegistry = require('getnpmregistry');
const chalk = require('chalk');
const ora = require('ora');
const insertCode = require('./insertCode');
const getNewRouteCode = require('./replaceRouter');
const router = require('./router.config');

const spinner = ora();

let isJS = false;

const fetchGithubFiles = async () => {
  const ignoreFile = ['_scripts', 'tests'];
  const data = await fetch('https://api.github.com/repos/ant-design/pro-blocks/git/trees/master');
  if (data.status !== 200) {
    return [];
  }
  const { tree } = await data.json();
  const files = tree.filter(file => file.type === 'tree' && !ignoreFile.includes(file.path));
  return files;
};

const findAllInstallRouter = route => {
  let routers = [];
  route.forEach(item => {
    if (item.component && item.path) {
      if (item.path !== '/user' || item.path !== '/') {
        routers.push({
          ...item,
          routes: !!item.routes,
        });
      }
    }
    if (item.routes) {
      routers = routers.concat(findAllInstallRouter(item.routes));
    }
  });
  return routers;
};

const filterParentRouter = (route, layout) =>
  [...route]
    .map(item => {
      if (!item.path && item.component === '404') {
        return item;
      }
      if (item.routes && (!route.component || layout)) {
        return { ...item, routes: filterParentRouter(item.routes, false) };
      }
      if (item.redirect) {
        return item;
      }
      return null;
    })
    .filter(item => item);

const firstUpperCase = pathString =>
  pathString
    .replace('.', '')
    .split(/\/|-/)
    .map(s => s.toLowerCase().replace(/( |^)[a-z]/g, L => L.toUpperCase()))
    .filter(s => s)
    .join('');

const execCmd = (shell, cwd) => {
  const debug = process.env.DEBUG === 'pro-cli';
  return execa.commandSync(shell, {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true,
    },
    stderr: debug ? 'inherit' : 'pipe',
    stdout: debug ? 'inherit' : 'pipe',
  });
};

const installBlock = async (cwd, arg) => {
  let gitFiles = await fetchGithubFiles();
  const installRouters = findAllInstallRouter(router);

  const installBlockIteration = async i => {
    const item = installRouters[i];

    if (!item || !item.path) {
      return Promise.resolve();
    }
    const gitPath = firstUpperCase(item.path);

    // 如果这个区块在 git 上存在
    if (gitFiles.find(file => file.path === gitPath)) {
      spinner.start(`📦  install ${chalk.green(item.name)}  to: ${chalk.yellow(item.path)}`);
      // 如果文件夹存在，删除他
      rimraf.sync(path.join(cwd, '/src/pages', item.path));

      // 从路由中删除这个区块
      gitFiles = gitFiles.filter(file => file.path !== gitPath);
      console.log(arg);
      const cmd = [
        `umi block add https://github.com/ant-design/pro-blocks/tree/master/${gitPath}`,
        `--path=${item.path}`,
        '--skip-dependencies',
        `--branch=${arg.branch || 'master'}`,
      ];

      // 如果是 routes 就不修改路由
      if (item.routes) {
        cmd.push('--skip-modify-routes');
      }

      // 如果是 config.js 就下载 js 的区块
      if (isJS) {
        cmd.push('--js');
      }

      try {
        const { exitCode } = execCmd(cmd.join(' '), cwd);
        if (exitCode === 1) {
          process.exit();
        }
        spinner.succeed();
      } catch (error) {
        console.error(error);
        process.exit();
      }
    }
    return installBlockIteration(i + 1);
  };
  // 安装路由中设置的区块
  await installBlockIteration(0);
};

module.exports = async ({ cwd, js, ...rest }) => {
  spinner.start('🧐  find config.ts ...');
  let relativePath = path.join(cwd, './config/config.ts');
  isJS = js;
  // 如果 ts 不存在 去找 js 的
  if (!fs.existsSync(relativePath)) {
    spinner.warn();
    spinner.start('🧐  find config.js ...');

    relativePath = path.join(cwd, './config/config.js');
    isJS = true;
  }

  if (!fs.existsSync(relativePath)) {
    spinner.warn();
    // 如果 js 还不在报错
    console.log(chalk.red('🤔  config.js or config.ts not found'));
    return;
  }
  spinner.succeed();

  // replace router config
  const parentRouter = filterParentRouter(router, true);
  const { routesPath, code } = getNewRouteCode(relativePath, parentRouter);

  // write ParentRouter
  fs.writeFileSync(routesPath, code);

  await installBlock(cwd, rest);
  await insertCode(cwd, rest);

  /**
   * 安装依赖，因为 pro 的中忽略了依赖安装来增加速度
   */
  const useYarn = fs.existsSync(path.join(cwd, 'yarn.lock'));
  const registryUrl = await getNpmRegistry();
  console.log(
    [useYarn ? 'yarn' : 'npm', useYarn ? '' : 'install', `--registry=${registryUrl}`]
      .filter(n => n)
      .join(' '),
  );
  spinner.start(`🚚  install dependencies package`);
  execCmd(
    [useYarn ? 'yarn' : 'npm', useYarn ? '' : 'install', `--registry=${registryUrl}`].join(' '),
  );

  spinner.succeed();

  process.exit();
};
