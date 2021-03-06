/*
 * 获取用户地址 Geohash
 * 依赖：HybridAPI Geohash.js Promise 以及 fetch
 * 优先级：url?geohash=XXX > HybridAPI/AlipayJSAPI > Navigator > restAPI
 */

import resolveFetch from './resolveFetch.js'

const FROM_OPEN = /opensite/.test(document.domain)
const APIHOST = FROM_OPEN
  ? location.origin.replace(/\:\/\/opensite([-|.][^.]+)/,"://opensite-restapi$1")
  : location.origin.replace(/\:\/\/(h5|h)\./, `://mainsite-restapi.`)
const APIURL = `${APIHOST}/shopping/v1/cities/guess`
const $get = url => window.fetch(url, {
  credentials: 'include',
}).then(resolveFetch)

const wait = time => {
  return new Promise(resolve => {
    setTimeout(resolve, time)
  })
}

const getParamHash = () => {
  if (!window.UParams) return ''
  return window.UParams().geohash || ''
}

const getAppHash = (timeout = 5000, interval = 100) => {
  let intervalTimer = null

  const stop = () => {
    clearInterval(intervalTimer)
  }

  return new Promise((resolve, reject) => {
    if (!window.hybridAPI) {
      return reject()
    }

    let loop = () => {
      window.hybridAPI.getGlobalGeohash(hash => {
        if (!hash) return
        stop()
        resolve(hash)
      })
    }

    intervalTimer = setInterval(loop, interval)
    loop()

    setTimeout(() => {
      stop()
      reject()
    }, timeout)
  })
}

const getNavigatorHash = (timeout = 5000) => {
  // Read more info: https://developer.mozilla.org/zh-CN/docs/Web/API/Geolocation/getCurrentPosition
  if (!navigator.geolocation) return Promise.reject()
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(position => {
      resolve(window.Geohash.encode(position.coords.latitude, position.coords.longitude))
    }, reject, {
      timeout,
      maximumAge: 10000,
    })
  })
}

const getAPIHash = () => {
  return $get(APIURL)
  .then(({ latitude, longitude }) => {
    return window.Geohash.encode(latitude, longitude)
  })
}

const getAlipayHash = (timeout = 3000) => {
  // 依赖alipay-jssdk
  if (!window.ap) return Promise.reject()

  return ap.getLocation({
    timeout: Math.round(timeout / 1000),
  })
  .then(res => {
    const geohash = window.Geohash.encode(res.latitude, res.longitude)
    return geohash
  })
}

const browserMode = (timeout) => {
  // 通过原生 API 获取失败后,看下有没有 apiHash 没有的话直接 reject()
  return new Promise((resolve, reject) => {
    getNavigatorHash(timeout)
    .then(resolve)
    .catch(() => getAPIHash())
    .then(resolve)
    .catch(reject)

    setTimeout(reject, timeout)
  })
}

const appMode = (timeout, browserModeDisabled) => {
  return getAppHash(timeout * 2 / 3)
    .catch(() => browserModeDisabled ? Promise.reject() : browserMode(timeout * 1 / 3))
}

const alipayMode = (timeout) => {
  return getAlipayHash(timeout * 1 / 3)
    .catch(() => browserMode(timeout * 2 / 3))
}

const getGeohash = (timeout = 9000, browserModeDisabled = true) => {
  let source
  // 优先使用 URL 中传来的 geohash 参数
  let hash = getParamHash()
  if (hash) {
    return Promise.resolve(hash)
  }

  if (/Eleme/i.test(navigator.userAgent)) {
    source = appMode(timeout, browserModeDisabled)
  } else if (/AlipayClient/.test(navigator.userAgent)) {
    source = alipayMode(timeout)
  } else {
    source = browserMode(timeout)
  }

  return source
}

getGeohash.getParamHash = getParamHash
getGeohash.useApp = getAppHash
getGeohash.useGeoAPI = getNavigatorHash
getGeohash.useRestAPI = getAPIHash
getGeohash.useAlipay = getAlipayHash

export default getGeohash
