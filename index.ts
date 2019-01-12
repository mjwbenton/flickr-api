import request from "request-promise";

const FLICKR_URL_BASE = "https://www.flickr.com/photos/";
const FLICKR_API_BASE_URL = "https://api.flickr.com/services/rest/";
const FLICKR_BASE_PARAMETERS = "?format=json&nojsoncallback=1";

const FLICKR_PHOTOS_METHOD = "flickr.photosets.getPhotos";
const FLICKR_SIZES_METHOD = "flickr.photos.getSizes";
const PHOTO_ID_KEY = "photo_id";
const PHOTOSET_ID_KEY = "photoset_id";

const WANTED_IMAGE_SIZES = new Set([
  "Medium",
  "Medium 640",
  "Medium 800",
  "Large",
  "Large 1600",
  "Large 2048"
]);

async function callFlickr(
  apiKey: string,
  methodName: string,
  params: { [key: string]: string },
  retryNumber: number = 0
): Promise<any> {
  let url =
    FLICKR_API_BASE_URL + FLICKR_BASE_PARAMETERS + `&api_key=${apiKey}&`;
  let paramsStr = `method=${methodName}`;
  Object.keys(params).forEach(key => {
    const value = params[key];
    paramsStr += `&${key}=${value}`;
  });
  url += paramsStr;
  try {
    const resultStr = await request(url);
    return JSON.parse(resultStr);
  } catch (err) {
    if (retryNumber < 2) {
      return callFlickr(apiKey, methodName, params, retryNumber + 1);
    }
    console.error(`Error calling flickr url: ${url}\n${err}`);
    throw err;
  }
}

export type Photo = {
  id: string;
  pageUrl: string;
  title: string;
  mainSource: PhotoSource;
  sources: PhotoSource[];
};

export type PhotoSource = {
  url: string;
  width: number;
  height: number;
};

export async function getPhotoSet(
  apiKey: string,
  setId: string
): Promise<Array<Photo>> {
  const photosResponse = await callFlickr(apiKey, FLICKR_PHOTOS_METHOD, {
    [PHOTOSET_ID_KEY]: setId
  });
  const owner = photosResponse.photoset.owner;
  const promises: Promise<Photo>[] = photosResponse.photoset.photo.map(
    async (p: any) => {
      const sizes = await callFlickr(apiKey, FLICKR_SIZES_METHOD, {
        [PHOTO_ID_KEY]: p.id
      });
      const photoSources: PhotoSource[] = sizes.sizes.size
        .filter((el: any) => WANTED_IMAGE_SIZES.has(el.label))
        .map((el: any) => ({
          url: el.source,
          width: parseInt(el.width),
          height: parseInt(el.height)
        }))
        .sort((a: PhotoSource, b: PhotoSource) => b.width - a.width);
      const mainSource = photoSources[photoSources.length - 1];
      return {
        id: p.id,
        title: p.title,
        pageUrl: `${FLICKR_URL_BASE}${owner}/${p.id}/`,
        sources: photoSources,
        mainSource: mainSource
      };
    }
  );
  return await Promise.all(promises);
}

export async function getRecentPhotos(
  apiKey: string,
  user_id: string
): Promise<Photo[]> {
  const response = await callFlickr(apiKey, "flickr.people.getPublicPhotos", {
    user_id,
    extras: "url_z, url_c, url_l, url_k",
    per_page: "50"
  });
  return response.photos.photo.map((p: any) => ({
    pageUrl: `${FLICKR_URL_BASE}${p.owner}/${p.id}/`,
    title: p.title,
    mainSource: {
      url: p.url_c,
      height: p.height_c,
      width: p.width_c
    },
    sources: buildRecentSources(p)
  }));
}

function buildRecentSources(photoResponse: any): PhotoSource[] {
  const result: PhotoSource[] = [];
  Object.keys(photoResponse).forEach(key => {
    if (key.startsWith("url_")) {
      const sizeKey = key.replace("url_", "");
      result.push({
        url: photoResponse[key],
        height: photoResponse[`height_${sizeKey}`],
        width: photoResponse[`width_${sizeKey}`]
      });
    }
  });
  return result;
}
