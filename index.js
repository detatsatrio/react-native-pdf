import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Image,
  Platform,
  StyleSheet,
  requireNativeComponent,
} from 'react-native';
import PdfViewNativeComponent, { Commands as PdfViewCommands } from './fabric/RNPDFPdfNativeComponent';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ViewPropTypes } from 'deprecated-react-native-prop-types';
const SHA1 = require('crypto-js/sha1');

export default class Pdf extends Component {
  static propTypes = {
    ...ViewPropTypes,
    source: PropTypes.oneOfType([
      PropTypes.shape({
        uri: PropTypes.string,
        cache: PropTypes.bool,
        cacheFileName: PropTypes.string,
        expiration: PropTypes.number,
      }),
      PropTypes.number,
    ]).isRequired,
    page: PropTypes.number,
    scale: PropTypes.number,
    minScale: PropTypes.number,
    maxScale: PropTypes.number,
    horizontal: PropTypes.bool,
    spacing: PropTypes.number,
    password: PropTypes.string,
    onLoadComplete: PropTypes.func,
    onPageChanged: PropTypes.func,
    onError: PropTypes.func,
    onPageSingleTap: PropTypes.func,
    onScaleChanged: PropTypes.func,
    onPressLink: PropTypes.func,
    trustAllCerts: PropTypes.bool,
    singlePage: PropTypes.bool,
  };

  static defaultProps = {
    password: '',
    scale: 1,
    minScale: 1,
    maxScale: 3,
    spacing: 10,
    horizontal: false,
    page: 1,
    trustAllCerts: true,
    singlePage: false,
    onLoadComplete: () => {},
    onPageChanged: () => {},
    onError: () => {},
    onPageSingleTap: () => {},
    onScaleChanged: () => {},
    onPressLink: () => {},
  };

  constructor(props) {
    super(props);
    this.state = {
      path: '',
      isDownloaded: false,
      progress: 0,
    };
    this.mounted = false;
    this.lastTask = null;
  }

  componentDidMount() {
    this.mounted = true;
    this.loadSource(this.props.source);
  }

  componentDidUpdate(prevProps) {
    if (this.props.source !== prevProps.source) {
      this.cancelTask();
      this.loadSource(this.props.source);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.cancelTask();
  }

  cancelTask = () => {
    if (this.lastTask?.cancel) {
      this.lastTask.cancel(() => {
        this.lastTask = null;
      });
    }
  };

  loadSource = async (source) => {
    const resolvedSource = Image.resolveAssetSource(source) || {};
    const { uri = '', cache, cacheFileName, expiration } = resolvedSource;

    if (!uri) {
      this.handleError(new Error('No PDF source provided'));
      return;
    }

    const filename = cacheFileName || `${SHA1(uri)}.pdf`;
    const cacheFile = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;

    if (cache) {
      try {
        const stats = await ReactNativeBlobUtil.fs.stat(cacheFile);
        const isExpired = expiration && (Date.now() > stats.lastModified + expiration * 1000);

        if (!isExpired) {
          this.safeSetState({ path: cacheFile, isDownloaded: true });
          return;
        }
      } catch {
        // Cache miss or error; proceed to download
      }
    }

    await this.prepareFile(resolvedSource, cacheFile);
  };

  prepareFile = async (source, cacheFile) => {
    const { uri } = source;

    try {
      if (/^https?:\/\//.test(uri)) {
        await this.downloadFile(source, cacheFile);
      } else if (/^bundle-assets:\/\//.test(uri)) {
        await ReactNativeBlobUtil.fs.cp(uri, cacheFile);
      } else if (/^data:application\/pdf;base64,/.test(uri)) {
        const base64Data = uri.replace(/^data:application\/pdf;base64,/, '');
        await ReactNativeBlobUtil.fs.writeFile(cacheFile, base64Data, 'base64');
      } else {
        this.safeSetState({ path: decodeURIComponent(uri.replace(/^file:\/\//, '')), isDownloaded: true });
      }
    } catch (error) {
      this.handleError(error);
    }
  };

  downloadFile = (source, cacheFile) => {
    const tempCacheFile = `${cacheFile}.tmp`;

    this.lastTask = ReactNativeBlobUtil.config({
      path: tempCacheFile,
      trusty: this.props.trustAllCerts,
    }).fetch(source.method || 'GET', source.uri, source.headers || {}, source.body || '');

    this.lastTask
      .progress((received, total) => {
        if (this.mounted) {
          this.setState({ progress: received / total });
        }
      })
      .then(async (res) => {
        if (this.validateDownloadedFile(res, source)) {
          await ReactNativeBlobUtil.fs.cp(tempCacheFile, cacheFile);
          this.safeSetState({ path: cacheFile, isDownloaded: true });
        }
        await ReactNativeBlobUtil.fs.unlink(tempCacheFile);
      })
      .catch((error) => {
        this.handleError(error);
        ReactNativeBlobUtil.fs.unlink(tempCacheFile);
      });
  };

  validateDownloadedFile = (res, source) => {
    const contentLength = res.respInfo.headers['Content-Length'];
    if (contentLength) {
      const actualSize = ReactNativeBlobUtil.fs.statSync(res.path()).size;
      if (Number(contentLength) !== Number(actualSize)) {
        throw new Error(`Download size mismatch for ${source.uri}`);
      }
    }
    return true;
  };

  safeSetState = (newState) => {
    if (this.mounted) {
      this.setState(newState);
    }
  };

  handleError = (error) => {
    if (this.props.onError) {
      this.props.onError(error);
    }
  };

  render() {
    const { path, isDownloaded } = this.state;
    if (!isDownloaded) return null;

    return (
      <PdfViewNativeComponent
        {...this.props}
        path={path}
        ref={(ref) => {
          this._root = ref;
        }}
      />
    );
  }
}
