/**
 * Derived from Derek Lu's custom storefront
 * http://www.adobe.com/devnet/digitalpublishingsuite/articles/getting-started-with-v2-library-and-store-api.html
 */

// Wait till all the HTML documents are loaded
$(document).ready(function() {
    console.log("doc ready",  this);
    // Load the Adobe DPS library API and wait till it is ready
    adobeDPS.initializationComplete.addOnce(displayLibrary, this);
});

/**
 * This method is called IFF the Adobe DPS library API is successfully loaded.
 * The following operations will be performed:
 * - sort the folios
 * - display each individual folio
 * - add a listener for new folios discovered by the app
 */
function displayLibrary() {
    console.log("DPS object ready", adobeDPS);
    console.log("Initializing library...", adobeDPS.libraryService.folioMap);

    // Sort the folios in descending order by publication date
    var list = adobeDPS.libraryService.folioMap.sort(function (a, b) {
        if (a.publicationDate < b.publicationDate)
            return 1;
        else if (a.publicationDate > b.publicationDate)
            return -1;
        else
            return 0;
    });

    /**
     * The list in adobeDPS.libraryService.folioMap is an associative array,
     * store it in a regular array for each of use.
     */
    for (var i in list) {
        var folio = list[i];
        // Calls FolioView() to generate and display the folio item
        new FolioView(folio);
    }

    /**
     * Add a listener for when folios are added.
     * This does not correspond to when a new folio is pushed,
     * rather when the viewer is aware of new folios.
     */
    adobeDPS.libraryService.folioMap.addedSignal.add(function(folios) {
    	// folios is a list of folio(s) discovered by the app.
        for (var i = 0; i < folios.length; i++) {
        	// Calls FolioView() to generate and display the folio item
            new FolioView(folios[i]);
        }
    }, this);
}

/**
 * Object to handle the view of each folio.
 * The following operations will be performed:
 * - generates HTML element with folio content
 * - keeps track of the folio state: buy, download, open
 * @param {object} folio - Object containing folio-level metadata, obtained from adobeDPS.libraryService.folioMap
 */
function FolioView(folio) {
    console.log("Adding folio:",  folio);

    // Stores the folio's product ID
	var productId = folio.productId;
	// Generates a HTML element with folio metadata and preview image
	var html  = "<div id='" + productId + "' class='folioView'>";
		html += 	"<img class='folioImg' src='" + folio.previewImageURL + "' />";
		html += 	"<div class='folioInfo'>"
		html += 	"<div class='folioNum'>&#35; " + folio.folioNumber + "</div>";
		html += 	"<div class='folioTitle'>" + folio.title + "</div>";
		html += 	"<div class='folioDesc'>" + folio.folioDescription + "</div>";
		html += 	"<div class='buy-button'></div>";
		html += 	"<div class='archive-button'>Archive</div>";
		html += 	"<div class='download-amount'></div>";
		html += 	"<div class='state'></div>";
		html +=     "</div>";
		html += "</div>";

	// Stores pointer to the generated HTML element for reference
	this.$el = $(html);

	// Appends the generated HTML element to the body
	$("body").append(this.$el);

	// Store pointers to the folio button
	this.$downloadAmount = this.$el.find(".download-amount");
	this.$state = this.$el.find(".state");
	this.$buyButton = this.$el.find(".buy-button");
	this.$archiveButton = this.$el.find(".archive-button");
	// Stores pointer to folio preview image
	this.$img = this.$el.find(".folioImg");
	// Stores folio object
	this.folio = folio;
	// Adds an update signal to the folio
	this.folio.updatedSignal.add(this.updatedSignalHandler, this);

	/*
	 * Determine if the folio was in the middle of downloading.
	 * If the folio is downloading, then find the paused transaction and resume.
	 */
	if (this.folio.state == adobeDPS.libraryService.folioStates.DOWNLOADING) {
		var transactions = this.folio.currentTransactions;
		var len = transactions.length;
		for (var i = 0; i < len; i++) {
			var transaction = transactions[i];
			if (transaction.state == adobeDPS.transactionManager.transactionStates.PAUSED) {
				transaction.resume();
				break;
			}
		}
	}

	var scope = this;
	// Attach click listeners to the buy and archive buttons
	this.$buyButton.on("click", function() { scope.buyButton_clickHandler() });
	this.$archiveButton.on("click", function() { scope.archiveButton_clickHandler() });

	// Calls helper method updateView() to update the folio button
	this.updateView();

	/**
	 * Function for validating the download status of the folio preview image.
	 * After a successful download, update the placeholder image with the actual image.
	 * @param {object} transaction - Object containing information about an transaction
	 */
	this.getPreviewImageHandler = function(transaction) {
        console.log("getPreviewImageHandler ", transaction);
		if (transaction.state == adobeDPS.transactionManager.transactionStates.FINISHED && transaction.previewImageURL != null) {
			// Updates the folio preview image placeholder with the actual preview image
			this.$img.attr("src", transaction.previewImageURL);
            this.$el.addClass("appear");
		} else if (transaction.previewImageURL == null) {
			// Sometimes previewImageURL is null so attempt another reload
			console.log("unable to load preview URL");
		}
	};

	// Starts a download transaction for the folio preview image
    var transaction = this.folio.getPreviewImage(135, 180, true);
    console.log("getPreviewImage", transaction);
    // Adds a listener to the transaction, calls helper method getPreviewImageHandler() upon finish
    transaction.completedSignal.addOnce(this.getPreviewImageHandler, this);
}

FolioView.prototype.updatedSignalHandler = function(properties) {
	// Calls helper method updateView() to update the folio button
	this.updateView();

	// The buy button is disabled before downloading so if it is made viewable
	// during the download then enable it again.
	if (properties.indexOf("isViewable") > -1 && this.folio.isViewable)
		this.enableBuyButton(true);

	// If there is a current transaction then start tracking it.
	if ((properties.indexOf("state") > -1 || properties.indexOf("currentTransactions") > -1) && this.folio.currentTransactions.length > 0)
		this.trackTransaction();
}

FolioView.prototype.updateView = function(properties) {
	var label = "";
	var state = "";

	switch (this.folio.state) {
		case adobeDPS.libraryService.folioStates.INVALID:
			state = "Invalid";
			label = "ERROR";
			break;
		case adobeDPS.libraryService.folioStates.UNAVAILABLE:
			state = "Unavailable";
			label = "ERROR";
			break;
		case adobeDPS.libraryService.folioStates.PURCHASABLE:
			label = "BUY " + this.folio.price;
			break;
		case adobeDPS.libraryService.folioStates.ENTITLED:
			this.enableBuyButton(true);
			this.showArchiveButton(false);
			label = "DOWNLOAD";
			break;
		case adobeDPS.libraryService.folioStates.DOWNLOADING:
			if (!this.folio.isViewable) {
				this.enableBuyButton(false);
			}
			if (!this.currentDownloadTransaction || (this.currentDownloadTransaction && this.currentDownloadTransaction.progress == 0)) {
				this.setDownloadPercent(0);
				state = "Waiting";
			}
			label = "VIEW";
			break;
		case adobeDPS.libraryService.folioStates.INSTALLED:
			label = "VIEW";
			this.showArchiveButton(true);
			break;
		case adobeDPS.libraryService.folioStates.PURCHASING:
		case adobeDPS.libraryService.folioStates.EXTRACTING:
		case adobeDPS.libraryService.folioStates.EXTRACTABLE:
			state = "Extracting";
			label = "VIEW";
			break;
	}
	this.$state.html(state);
	this.$buyButton.html(label);
}

// Looks for the current state changing transaction and begins tracking it if necessary.
FolioView.prototype.trackTransaction = function() {
	if (this.isTrackingTransaction)
		return;

	var transaction;
	for (var i = 0; i < this.folio.currentTransactions.length; i++) {
        transaction = this.folio.currentTransactions[i];
        if (transaction.isFolioStateChangingTransaction()) {
            // found one, so break and attach to this one
            break;
        } else {
            // null out transaction since we didn't find a traceable one
            transaction = null;
        }
    }

	if (!transaction)
		return;

	// Make sure to only track the transactions below.
	var transactionType = transaction.jsonClassName;
	if (transactionType != "DownloadTransaction" &&
		transactionType != "UpdateTransaction" &&
		transactionType != "PurchaseTransaction" &&
		transactionType != "ArchiveTransaction" &&
		transactionType != "ViewTransaction") {
		return;
	}

	// Check if the transaction is active yet
	if (transaction.state == adobeDPS.transactionManager.transactionStates.INITALIZED) {
		// This transaction is not yet started, but most likely soon will
		// so setup a callback for when the transaction starts
		transaction.stateChangedSignal.addOnce(this.trackTransaction, this);
		return;
	}

	this.isTrackingTransaction = true;

	this.currentDownloadTransaction = null;
	if (transactionType == "DownloadTransaction" || transactionType == "UpdateTransaction") {
		transaction.stateChangedSignal.add(this.download_stateChangedSignalHandler, this);
		transaction.progressSignal.add(this.download_progressSignalHandler, this);
		transaction.completedSignal.add(this.download_completedSignalHandler, this);
		this.currentDownloadTransaction = transaction;

		// this will occur if a user toggles to this view and more than one download is already occurring.
		// download_stateChangedSignalHandler should be triggered but it is not.
		if (transaction.state == adobeDPS.transactionManager.transactionStates.PAUSED)
			this.$state.html("Paused");
	} else {
		// add a callback for the transaction.
		transaction.completedSignal.addOnce(function() {
			this.isTrackingTransaction = false;
		}, this)
	}
}

/**
 * Handler for when a user clicks the archive button.
 */
FolioView.prototype.archiveButton_clickHandler = function() {
	// removes the folio from the display
	if (this.folio.isArchivable) {
		this.folio.archive();
	}
}

/**
 * Handler for when a user clicks the buy button.
 */
FolioView.prototype.buyButton_clickHandler = function() {
	var state = this.folio.state;
	// checks the state of the folio
	if (state == adobeDPS.libraryService.folioStates.PURCHASABLE) {
		// if the folio is purchasable, calls helper purchase() to initiate a purchase
		this.purchase();
	} else if (state == adobeDPS.libraryService.folioStates.INSTALLED || this.folio.isViewable) {
		// if the folio is installed and viewable, open the folio
		this.folio.view();
	} else if (state == adobeDPS.libraryService.folioStates.ENTITLED) {
		// if the folio is not installed but user is entitled to it, then download it
		if (this.isBuyButtonEnabled)
			this.folio.download();
	}
}

/**
 * Changes the opacity of the buyButton to give an enabled or disabled state.
 * @param {boolean} value - True to show the buy button, false otherwise
 */
FolioView.prototype.enableBuyButton = function(value) {
	this.$buyButton.css("opacity", value ? 1 : .6);
	this.isBuyButtonEnabled = value;
}

/**
 * Purchases the folio.
 */
FolioView.prototype.purchase = function() {
	// initiates a folio purchase transaction
	var transaction = this.folio.purchase();
	// adds a listener for the transaction
	transaction.completedSignal.addOnce(function(transaction) {
		// the purchase will either succeed or fail
		if (transaction.state == adobeDPS.transactionManager.transactionStates.FINISHED) {
			// if succeed, stops tracking the transaction and download the folio
			this.isTrackingTransaction = false;
			this.folio.download();
		} else if (transaction.state == adobeDPS.transactionManager.transactionStates.FAILED) {
			alert("Sorry, unable to purchase");
		}
		// Calls helper method updateView() to update the folio button
		this.updateView();
	}, this);
}

/**
 * Downloads are automatically paused if another one is initiated,
 * so watch for changes with this callback.
 */
FolioView.prototype.download_stateChangedSignalHandler = function(transaction) {
	if (transaction.state == adobeDPS.transactionManager.transactionStates.FAILED) {
		this.download_completedSignalHandler(transaction);
		// Calls helper method updateView() to update the folio button
		this.updateView();
		this.enableBuyButton(true);
	} else if (transaction.state == adobeDPS.transactionManager.transactionStates.PAUSED) {
		this.$state.html("Paused");
	} else {
		this.$state.html("");
	}
}

/**
 * Updates the progress bar for downloads and updates.
 */
FolioView.prototype.download_progressSignalHandler = function(transaction) {
	this.setDownloadPercent(transaction.progress);
}

/**
 * Handler for when a download or update completes.
 * Removes all signal that was added to a folio during a download or update transaction.
 * @param {object} transaction - Object containing status of a given transaction
 */
FolioView.prototype.download_completedSignalHandler = function(transaction) {
	transaction.stateChangedSignal.remove(this.download_stateChangedSignalHandler, this);
	transaction.progressSignal.remove(this.download_progressSignalHandler, this);
	transaction.completedSignal.remove(this.download_completedSignalHandler, this);
	this.isTrackingTransaction = false;
}

/**
 * Sets the length of the download progress bar, based on the current download progress.
 * @param {int} value - Integer value of the current folio download progress
 */
FolioView.prototype.setDownloadPercent = function(value){
	value *= .01;
	this.$downloadAmount.html(Math.round(value * (this.folio.downloadSize / 1000000)) + " MB of " + Math.round(this.folio.downloadSize / 1000000) + " MB");
}

/**
 * Display or hide the archive button depending on the given boolean value.
 * @param {boolean} value - True to show the archive button, false otherwise
 */
FolioView.prototype.showArchiveButton = function(value) {
	this.$archiveButton.css("display", value ? "block" : "none");
    if(value) this.$downloadAmount.html("");
}

