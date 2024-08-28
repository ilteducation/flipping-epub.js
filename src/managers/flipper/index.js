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
}

export default FlipperManager;