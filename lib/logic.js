'use strict';
var NS = 'com.authmeds.prescription.redeem';
/**
 * Close the buying for product listing and choose the
 * highest buy that is over the asking price
 * @param {com.authmeds.prescription.redeem.CloseBuying} closeBuying - the closeBuying transaction
 * @transaction
 */
function closeBuying(closeBuying) {
  var listing = closeBuying.listing;
  if(listing.state !== 'FOR_SALE') {
    throw new Error('Listing is not FOR SALE');
  }
  // by default we mark the listing as RESERVE_NOT_MET
  listing.state = 'RESERVE_NOT_MET';
  var oldOwner = listing.product.owner.email;
  var highestOffer = null;
  var buyer = null;
  var seller = listing.product.owner;
  if(listing.offers && listing.offers.length > 0) {
    // sort the buys by buyPrice
    listing.offers.sort(function(a, b) {
      return(b.buyPrice - a.buyPrice);
    });
    highestOffer = listing.offers[0];
    if(highestOffer.buyPrice >= listing.reservePrice) {
      buyer = highestOffer.member;
      //seller = listing.owner;
      // update the balance of the seller
      seller.balance += highestOffer.buyPrice;
      // update the balance of the buyer
      buyer.balance -= highestOffer.buyPrice;
      // transfer the product to the buyer
      listing.product.owner = buyer;
      // Clear the offers
      //listing.offers = null;
      // mark the listing as SOLD
      listing.state = 'SOLD';
    }
  }
  listing.product.owner.prescriptions.push(listing.product);
  return getParticipantRegistry(NS + '.Seller').then(function(sellerRegistry) {
    // update seller
    return sellerRegistry.update(seller);
  }).then(function() {
    if(listing.state === 'SOLD') {
      return getParticipantRegistry(NS + '.Member').then(function(memberRegistry) {
        return memberRegistry.update(buyer);
      });
    }
  }).then(function() {
    return getAssetRegistry(NS + '.Prescription');
  }).then(function(productRegistry) {
    // remove the listing
    return productRegistry.update(listing.product);
  }).then(function() {
    return getAssetRegistry(NS + '.PrescriptionListing');
  }).then(function(productListingRegistry) {
    // remove the listing
    return productListingRegistry.update(listing);
  });
}
/**
 * Make an Offer for a PrescriptionListing
 * @param {com.authmeds.prescription.redeem.Offer} offer - the offer
 * @transaction
 */
function makeOffer(offer) {
  var listing = offer.listing;
  if(listing.state !== 'FOR_SALE') {
    throw new Error('Listing is not FOR SALE');
  }
  if(offer.member.balance < offer.buyPrice) {
    throw new Error('Insufficient fund for buy. Please verify the placed buy!!');
  }
  return getAssetRegistry(NS + '.PrescriptionListing').then(function(productListingRegistry) {
    // save the product listing
    listing.offers.push(offer);
    return productListingRegistry.update(listing);
  });
}
/**
 * Create a new listing
 * @param {com.authmeds.prescription.redeem.StartBuying} publishListing - the listing transaction
 * @transaction
 */
function publishListing(listing) {
  listing.product.owner.prescriptions = listing.product.owner.prescriptions.filter(function(object) {
    return object.getIdentifier() !== listing.product.getIdentifier();
  });
  var productListing = null;
  var factory = getFactory();
  return getAssetRegistry(NS + '.PrescriptionListing').then(function(registry) {
    // Create the bond asset.
    productListing = factory.newResource(NS, 'PrescriptionListing', listing.listingId);
    productListing.reservePrice = listing.reservePrice;
    productListing.state = 'FOR_SALE';
    productListing.product = listing.product;
    productListing.offers = [];
    // Add the bond asset to the registry.
    return registry.add(productListing);
  }).then(function() {
    return getParticipantRegistry(NS + '.Seller');
  }).then(function(sellerRegistry) {
    // save the buyer
    return sellerRegistry.update(listing.product.owner);
  });
}
/**
 * Add new Prescription
 * @param {com.authmeds.prescription.redeem.AddPrescription} addPrescription - new product addition
 * @transaction
 */
function addPrescription(newproduct) {
  var product = getFactory().newResource(NS, 'Prescription', newproduct.productId);
  product.description = newproduct.description;
  product.owner = newproduct.owner;
  if(!product.owner.prescriptions) {
    product.owner.prescriptions = [];
  }
  product.owner.prescriptions.push(product);
  return getAssetRegistry(NS + '.Prescription').then(function(registry) {
    return registry.add(product);
  }).then(function() {
    return getParticipantRegistry(NS + '.Doctor');
  }).then(function(sellerRegistry) {
    return sellerRegistry.update(newproduct.owner);
  });
}
