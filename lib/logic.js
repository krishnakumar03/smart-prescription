'use strict';
var NS = 'com.authmeds.prescription.redeem';
/**
 * Close the buying for prescription listing and choose the
 * highest buy that is over the asking price
 * @param {com.authmeds.prescription.redeem.CloseCounter} closeCounter - the closeCounter transaction
 * @transaction
 */
function closeCounter(closeCounter) {
  var listing = closeCounter.listing;
  if(listing.state !== 'FOR_SALE') {
    throw new Error('Listing is not FOR SALE');
  }
  // by default we mark the listing as RESERVE_NOT_MET
  listing.state = 'RESERVE_NOT_MET';
  var oldOwner = listing.prescription.owner.email;
  var highestOffer = null;
  var buyer = null;
  var seller = listing.prescription.owner;
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
      // transfer the prescription to the buyer
      listing.prescription.owner = buyer;
      // Clear the offers
      //listing.offers = null;
      // mark the listing as SOLD
      listing.state = 'SOLD';
    }
  }
  listing.prescription.owner.prescriptions.push(listing.prescription);
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
  }).then(function(prescriptionRegistry) {
    // remove the listing
    return prescriptionRegistry.update(listing.prescription);
  }).then(function() {
    return getAssetRegistry(NS + '.PrescriptionListing');
  }).then(function(prescriptionListingRegistry) {
    // remove the listing
    return prescriptionListingRegistry.update(listing);
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
  return getAssetRegistry(NS + '.PrescriptionListing').then(function(prescriptionListingRegistry) {
    // save the prescription listing
    listing.offers.push(offer);
    return prescriptionListingRegistry.update(listing);
  });
}
/**
 * Create a new listing
 * @param {com.authmeds.prescription.redeem.StartCounter} publishListing - the listing transaction
 * @transaction
 */
function publishListing(listing) {
  listing.prescription.owner.prescriptions = listing.prescription.owner.prescriptions.filter(function(object) {
    return object.getIdentifier() !== listing.prescription.getIdentifier();
  });
  var prescriptionListing = null;
  var factory = getFactory();
  return getAssetRegistry(NS + '.PrescriptionListing').then(function(registry) {
    // Create the bond asset.
    prescriptionListing = factory.newResource(NS, 'PrescriptionListing', listing.listingId);
    prescriptionListing.reservePrice = listing.reservePrice;
    prescriptionListing.state = 'FOR_SALE';
    prescriptionListing.prescription = listing.prescription;
    prescriptionListing.offers = [];
    // Add the bond asset to the registry.
    return registry.add(prescriptionListing);
  }).then(function() {
    return getParticipantRegistry(NS + '.Seller');
  }).then(function(sellerRegistry) {
    // save the buyer
    return sellerRegistry.update(listing.prescription.owner);
  });
}
/**
 * Add new Prescription
 * @param {com.authmeds.prescription.redeem.AddPrescription} addPrescription - new prescription addition
 * @transaction
 */
function addPrescription(newprescription) {
  var prescription = getFactory().newResource(NS, 'Prescription', newprescription.prescriptionId);
  prescription.description = newprescription.description;
  prescription.owner = newprescription.owner;
  if(!prescription.owner.prescriptions) {
    prescription.owner.prescriptions = [];
  }
  prescription.owner.prescriptions.push(prescription);
  return getAssetRegistry(NS + '.Prescription').then(function(registry) {
    return registry.add(prescription);
  }).then(function() {
    return getParticipantRegistry(NS + '.Doctor');
  }).then(function(sellerRegistry) {
    return sellerRegistry.update(newprescription.owner);
  });
}
