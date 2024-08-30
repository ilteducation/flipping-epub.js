import DefaultViewManager from "../default";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
	}

	display(section, target){
		return DefaultViewManager.prototype.display.call(this, section, target)
			.then(() => {
				return this.fill();
			});
	}

	fill() {

		// Add one more page after this one


		console.log("will try to fill the other pages");
	}
}

export default FlipperManager;