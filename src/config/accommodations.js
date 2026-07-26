// Hardcoded per-city hotel info for the Explore > Accommodations screen.
// Not synced from Firestore or Google Sheets — edit here and redeploy to update.
//
// Keys must match the city keys in Explore.jsx's CITIES list, which are the
// full city names ("Singapore" / "Ho Chi Minh City"), not short slugs.

export const ACCOMMODATIONS = {
  "Singapore": {
    name: "Hotel Mondrian Singapore",
    address: "16A Duxton Hill, Singapore 089970",
    websiteUrl: "https://mondrianhotels.com/singapore-duxton/",
  },
  "Ho Chi Minh City": {
    name: "Rex Hotel",
    address: "141 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh 700000, Vietnam",
    websiteUrl: "https://www.rexhotelsaigon.com/",
  },
};

// Builds a Google Maps search URL pre-filled with the hotel name + address.
// Building it dynamically (rather than hardcoding a maps.google.com URL)
// means future hotel changes only require editing name/address above.
export function getMapsUrl(hotel) {
  const query = encodeURIComponent(`${hotel.name}, ${hotel.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
