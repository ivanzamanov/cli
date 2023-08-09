/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {logger} from '@react-native-community/cli-tools';
import type {Config} from '@react-native-community/cli-types';
import chalk from 'chalk';
import fs from 'fs';
import type {ConfigT} from 'metro-config';
import Server from 'metro/src/Server';
import outputBundle from 'metro/src/shared/output/bundle';
import type {BundleOptions} from 'metro/src/shared/types';
import path from 'path';
import {default as loadMetroConfig} from '../../tools/loadMetroConfig';
import {CommandLineArgs} from './bundleCommandLineArgs';
import saveAssets from './saveAssets';

interface RequestOptions {
  entryFile: string;
  sourceMapUrl: string | undefined;
  dev: boolean;
  minify: boolean;
  platform: string;
  unstable_transformProfile: BundleOptions['unstable_transformProfile'];
}

async function buildBundle(
  args: CommandLineArgs,
  ctx: Config,
  output: typeof outputBundle = outputBundle,
) {
  const config = await loadMetroConfig(ctx, {
    maxWorkers: args.maxWorkers,
    resetCache: args.resetCache,
    config: args.config,
  });

  return buildBundleWithConfig(args, config, output);
}

/**
 * Create a bundle using a pre-loaded Metro config. The config can be
 * re-used for several bundling calls if multiple platforms are being
 * bundled.
 */
export async function buildBundleWithConfig(
  args: CommandLineArgs,
  config: ConfigT,
  output: typeof outputBundle = outputBundle,
) {
  if (config.resolver.platforms.indexOf(args.platform) === -1) {
    logger.error(
      `Invalid platform ${
        args.platform ? `"${chalk.bold(args.platform)}" ` : ''
      }selected.`,
    );

    logger.info(
      `Available platforms are: ${config.resolver.platforms
        .map((x) => `"${chalk.bold(x)}"`)
        .join(
          ', ',
        )}. If you are trying to bundle for an out-of-tree platform, it may not be installed.`,
    );

    throw new Error('Bundling failed');
  }

  // This is used by a bazillion of npm modules we don't control so we don't
  // have other choice than defining it as an env variable here.
  process.env.NODE_ENV = args.dev ? 'development' : 'production';

  let sourceMapUrl = args.sourcemapOutput;
  if (sourceMapUrl && !args.sourcemapUseAbsolutePath) {
    sourceMapUrl = path.basename(sourceMapUrl);
  }

  const requestOpts: RequestOptions = {
    entryFile: args.entryFile,
    sourceMapUrl,
    dev: args.dev,
    minify: args.minify !== undefined ? args.minify : !args.dev,
    platform: args.platform,
    unstable_transformProfile: args.unstableTransformProfile as BundleOptions['unstable_transformProfile'],
  };
  const server = new Server(config);

  try {
    const bundle = await output.build(server, requestOpts);

    // Ensure destination directory exists before saving the bundle
    const mkdirOptions = {recursive: true, mode: 0o755} as const;
    fs.mkdirSync(path.dirname(args.bundleOutput), mkdirOptions);

    await output.save(bundle, args, logger.info);

    // Save the assets of the bundle
    const outputAssets = await server.getAssets({
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...requestOpts,
      bundleType: 'todo',
    });

    // When we're done saving bundle output and the assets, we're done.
    return await saveAssets(
      outputAssets,
      args.platform,
      args.assetsDest,
      args.assetCatalogDest,
    );
  } finally {
    server.end();
  }
}

export default buildBundle;
