Spatial Database
===============

A spatial database in JavaScript.

Usage
-----

	var db = new SpatialDatabase();

	// Put objects in the database
	db.put({type: "point", x:10, y:20});
	db.put({type: "point", x:55, y:65});

	// Find all objects that are intersecting a circle
	var result = db.query({intersecting: {type: "circle", x: 100, y: 100, r: 50}});


Object Types &amp; Attributes
-----------------------------

* point - x, y
* rect  - x, y, w, h
* lineseg - p1: {x, y}, p2: {x, y}
* polygon - points: [{x,y}, {x,y},...]
* circle - x, y, r

Rotation
--------

