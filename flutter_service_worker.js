'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';
const RESOURCES = {
  ".git/COMMIT_EDITMSG": "f76ad2be5f7916d22461abc59db2c43a",
".git/config": "d3360d96a317c7a711196840919cd30e",
".git/description": "a0a7c3fff21f2aea3cfa1d0316dd816c",
".git/HEAD": "cf7dd3ce51958c5f13fece957cc417fb",
".git/hooks/applypatch-msg.sample": "ce562e08d8098926a3862fc6e7905199",
".git/hooks/commit-msg.sample": "579a3c1e12a1e74a98169175fb913012",
".git/hooks/fsmonitor-watchman.sample": "a0b2633a2c8e97501610bd3f73da66fc",
".git/hooks/post-update.sample": "2b7ea5cee3c49ff53d41e00785eb974c",
".git/hooks/pre-applypatch.sample": "054f9ffb8bfe04a599751cc757226dda",
".git/hooks/pre-commit.sample": "305eadbbcd6f6d2567e033ad12aabbc4",
".git/hooks/pre-merge-commit.sample": "39cb268e2a85d436b9eb6f47614c3cbc",
".git/hooks/pre-push.sample": "2c642152299a94e05ea26eae11993b13",
".git/hooks/pre-rebase.sample": "56e45f2bcbc8226d2b4200f7c46371bf",
".git/hooks/pre-receive.sample": "2ad18ec82c20af7b5926ed9cea6aeedd",
".git/hooks/prepare-commit-msg.sample": "2b5c047bdb474555e1787db32b2d2fc5",
".git/hooks/push-to-checkout.sample": "c7ab00c7784efeadad3ae9b228d4b4db",
".git/hooks/update.sample": "647ae13c682f7827c22f5fc08a03674e",
".git/index": "336e47db58681fcb465b5b713cb3c365",
".git/info/exclude": "036208b4a1ab4a235d75c181e685e5a3",
".git/logs/HEAD": "ebd2b72464402b6c181fb6924a9b02f6",
".git/logs/refs/heads/main": "ebd2b72464402b6c181fb6924a9b02f6",
".git/logs/refs/remotes/origin/HEAD": "34fa3f377f5252440e2b5016a6c5c641",
".git/logs/refs/remotes/origin/main": "8234180a84c2ebb4bae7c0d4a834a5b7",
".git/objects/02/b37eda14c130300da8654192d2ca4aa50f410c": "f7c14c2f1056e8033b4f52e5aa8c4a3d",
".git/objects/03/eaddffb9c0e55fb7b5f9b378d9134d8d75dd37": "87850ce0a3dd72f458581004b58ac0d6",
".git/objects/08/15eaa6596158840d0ac477f4208717c82c9d2b": "24fad3fb29ee2fe6a0f21bd4aabbb739",
".git/objects/19/fcabc50b06b9853bd877f968bc0808c6d7bc68": "35fd19ec2d2709ca9a047dfed6306e1e",
".git/objects/1a/b847b818dec389fb43fb9da80637c02e27d3d3": "8af286f2a069534106d53e8c037b0a4a",
".git/objects/1f/49e161ffd4d1462a72b58c13baade0ee927fc2": "1daee9b16ec69efd51ebde8a70a9149c",
".git/objects/23/6649977c86e03ed6f793fc35c2f73b7da8c352": "5f5a392524dd39ce8781a1d7fc66f248",
".git/objects/2b/2c3a562b375d8b8666585df340e8f3868f38a8": "92a5ead6e841d0afb413c30b02850499",
".git/objects/2c/c44047c33a156aaf6574775cabe46b0a4f3fe6": "8ac38aac6460171ac09a7f669d021911",
".git/objects/3a/ae5d7a38e32a2b38d2869065490d9321f6faf2": "7de899d628cfd91a138cdb9813038c62",
".git/objects/3f/7682a6e830e34f27e98a37d386fa63b2985df4": "1acac7a08041d4c873c649de6751474c",
".git/objects/40/b0e42545375bb8800ffc495f75a9940183463e": "3b3c45ff9013800334c76cf64603e6fb",
".git/objects/41/c366adc8c14cb3b27c4b9a3819c46cff4590c8": "015c7319a928384b6c0fc792ab95ec1a",
".git/objects/46/4ab5882a2234c39b1a4dbad5feba0954478155": "2e52a767dc04391de7b4d0beb32e7fc4",
".git/objects/52/01be6b9e111fbdb6f7d7006fab4b68760e8863": "5bf753174252e8c17cca62316e3726c6",
".git/objects/53/d2fbaee9e18f0ad0054fd1225b5aa859e0f0ac": "c687a4ce10f5756a9cf35aa1e1d1e2a4",
".git/objects/5a/98b9304f155c1b60dcd83caac78beefa075674": "3fcfdf324c3f1b30e5199e5704ec0e14",
".git/objects/60/a44572992c35c31933f67d603ae92fa1b2f5f4": "25a195083bbbf66311d7c9ce67e0479a",
".git/objects/68/ed60d1da6e851923c413f960c65f3020e7817e": "1a1a1d681d24a8be2e3ccd6bb3887180",
".git/objects/6f/d845730e01637ead797a5ad11e0e2a9dc02eac": "3f7ef92b24af5561e51f8bb89715fd0c",
".git/objects/6f/e5328cb360e42f7c650d67f000d31417f6d35b": "6967399506edaee63f02300284fac377",
".git/objects/79/ba7ea0836b93b3f178067bcd0a0945dbc26b3f": "f3e31aec622d6cf63f619aa3a6023103",
".git/objects/7a/0399946ac80e41b49539e098c00b970770ba27": "2c2a6c74abafe48a83fee703b81007d2",
".git/objects/7c/fb6f962bdb8c4b610bb1bb25b6c4361f9d20e8": "20235224869b650fc9ceb371e56bb5c9",
".git/objects/7d/b66abcb28393b4a6a230b8af228531657b2bdc": "a472007d604e85da07c709ba359a7ea1",
".git/objects/7d/f82d19e7f8e45cf7480e05863f9451886d75fb": "b658b6bc0e15d68533e692fa07d6641d",
".git/objects/80/d6d9d21a55ac28a4f50d1aef2263a89efa235a": "ed2736cea4da7dbb83a71b362265b9c1",
".git/objects/87/3fccd8569bd3f4507504dd98d9c99bcb7f92ad": "0e6b9660e4e7f1825163c8c7c1135e0d",
".git/objects/97/8746b5424d1212460133977131fc5ef0971abb": "3cc094294d4d3275ff02b12eff5e10c3",
".git/objects/99/9eadcb60a6ea655049c8b748daada84c0fd291": "e557aa0eb79e7ec4c15a8acf67e34880",
".git/objects/9f/224fec650fad1a4ef193f19bb89fd5396e70b2": "f335172c0ef5b41a8e6f1b62319aea6e",
".git/objects/a0/7d677ce2a870f2b2362488d48623a22141ecc5": "caf6c3ba49019900ab6b160cc5c15426",
".git/objects/a1/011da9238a8cb6d574f42db9e7de2c7f2c76d7": "8580fb80c623192a64147f22175da53f",
".git/objects/a1/3837a12450aceaa5c8e807c32e781831d67a8f": "bfe4910ea01eb3d69e9520c3b42a0adf",
".git/objects/ab/0e98497a51ead7821d1da35a24968ff314e50f": "557c35fe3928eb2af403d1b3926bb9ba",
".git/objects/b2/03088b48559cefcb8b44898afb59ca44d2e796": "1993cd11c0f77a5d4ab428b71239fa58",
".git/objects/bf/2b3f89db2114cde8bff5c303c258793a6eca5f": "c669cfce29ea84daadafa3af82b67a66",
".git/objects/cc/5725b315760d100f6386e6bbf09af8fe57a9f1": "29c19352d2bee0821600856656c95791",
".git/objects/cd/22076013ce8b84475eae9bb4cd6c60b5460fbe": "81c620e2d6cbe5638d6c90ee25886389",
".git/objects/d7/df966c62345816023fea2d3dbe3d5656beeb72": "3f88e5282361105cb86038587bc8fefb",
".git/objects/dc/d9ed64f792d0349254c6fbdb0a2df048e3ddcb": "c34994ab92c563116eff413da78eda9a",
".git/objects/de/28db843d7df6ed23b8a7526f6b6b4a83425fe7": "797e4f7b3d8dced098c51679ff33e848",
".git/objects/e0/2012ca0a73da86edd7614aebdc24f350669305": "4cb516f7f367eb8387729d8cfc7cf9b2",
".git/objects/e1/bdbeee49561a44e8f1dcdcc8fa2e371350c2a4": "4b2516e620f9d1e3d22ad1c0a42e6f44",
".git/objects/e5/951dfb943474a56e611d9923405cd06c2dd28d": "c6fa51103d8db5478e1a43a661f6c68d",
".git/objects/e9/cd1e942c44cb91f34f89d291755b27f7c0ca1a": "b35765efd1cf731e45bbe26f077bb770",
".git/objects/f8/c2dd8e31aa1714aded8584f98a1e62910f930a": "64e556e82fe3ea9b3af893e4bf303f84",
".git/objects/fd/36f4aae5a0c5be4e2734bd180c8f5890013557": "46e9e226628e17cc4696d8c2cef7b4bb",
".git/objects/pack/pack-730fb618492c24ffbb7c5bfe80d8288461e8b775.idx": "101537259dd91d6eab53fa1d16548b0d",
".git/objects/pack/pack-730fb618492c24ffbb7c5bfe80d8288461e8b775.pack": "231d8b301fd74894800836b7521ca8b9",
".git/packed-refs": "db54cb4981e029ce9c253fd7f05dffcd",
".git/refs/heads/main": "6b703b29d56db3850c99cd2e331257cc",
".git/refs/remotes/origin/HEAD": "98b16e0b650190870f1b40bc8f4aec4e",
".git/refs/remotes/origin/main": "6b703b29d56db3850c99cd2e331257cc",
"assets/AssetManifest.json": "e32bb05e8a239dec0959d3bea7337b71",
"assets/assets/icons/boy.png": "d34783fce6c77f8d625036955363c6cc",
"assets/assets/icons/logo_512x512.jpg": "5a0eff0a5b1a6dcaa4a3b8dac61fbc9d",
"assets/FontManifest.json": "dc3d03800ccca4601324923c0b1d6d57",
"assets/fonts/MaterialIcons-Regular.otf": "95db9098c58fd6db106f1116bae85a0b",
"assets/NOTICES": "3a5b3bc82c2467608d29e16f4a32c555",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "6d342eb68f170c97609e9da345464e5e",
"assets/shaders/ink_sparkle.frag": "6333b551ea27fd9d8e1271e92def26a9",
"canvaskit/canvaskit.js": "2bc454a691c631b07a9307ac4ca47797",
"canvaskit/canvaskit.wasm": "bf50631470eb967688cca13ee181af62",
"canvaskit/profiling/canvaskit.js": "38164e5a72bdad0faa4ce740c9b8e564",
"canvaskit/profiling/canvaskit.wasm": "95a45378b69e77af5ed2bc72b2209b94",
"favicon.png": "f763f5e69ca09b9e1a78ee3df148420e",
"flutter.js": "f85e6fb278b0fd20c349186fb46ae36d",
"heart/index.html": "c2700e1a3125ebdd3aeae3907634f1f8",
"/": "bbae66372e855fb94ac05d70e79bc218",
"icons/Icon-192.png": "5991bbc5789bc42506414db00f335a73",
"icons/Icon-512.png": "c7012bb2d558da49eae497c3e1572551",
"icons/Icon-maskable-192.png": "5991bbc5789bc42506414db00f335a73",
"icons/Icon-maskable-512.png": "c7012bb2d558da49eae497c3e1572551",
"index.html": "bbae66372e855fb94ac05d70e79bc218",
"main.dart.js": "96704c720a58d9c956ba9a123ab98b41",
"manifest.json": "16588077287db1927d6c38fe2621d4aa",
"version.json": "e97336b590d568301b9469656490f365"
};

// The application shell files that are downloaded before a service worker can
// start.
const CORE = [
  "main.dart.js",
"index.html",
"assets/AssetManifest.json",
"assets/FontManifest.json"];
// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});

// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});

// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});

self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});

// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}

// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
