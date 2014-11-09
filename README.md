Spatial Database
===============

A spatial database in JavaScript.

## Example Usage

	var db = new SpatialDatabase();

	// Put objects in the database
	db.put({type: "point", x:10, y:20});
	db.put({type: "point", x:55, y:65, MyCustomAttribute: "abc"});

	// Find all objects that are intersecting a circle
	var result = db.query({intersecting: {type: "circle", x: 100, y: 100, r: 50}});


## Object Types &amp; Attributes

* point - x, y
  * Example: db.put({type: "point", x:10, y:20});
* rect  - x, y, w (width), h (height)
  * Example: db.put({type: "rect", x:10, y:20, w:70, h:80});
* lineseg - p1: {x, y}, p2: {x, y}
  * Example: db.put({type: "lineseg", p1: {x:10, y:10}, p2: {x:120, y:300});
* polygon - points: [{x,y}, {x,y},...]
  * Example: db.put({type: "polygon", points: [{x:120, y:120}, {x:130, y: 110}, {x:200, y: 200}]});
* circle - x, y, r (radius)
  * Example: db.put({type: "circle", x:40, y:90, r: 30});

## Rotation

Any object may be rotated using the "rot" attribute.

* To rotate about the object's center just specify the angle in radians.
  * Example: db.put({type: "rect", x:100, y:100, w:100, h:80, rot:45*Math.PI/180});
* To rotate about an arbitrary point pass a struct in with both the angle and the point to rotate around.
  * Example: db.put({type: "rect", x:100, y:300, w:100, h:80, rot:{a:80*Math.PI/180, x:101, y:300}});

## Put

The put function is used to add or update objects.

If the object doesn't exist in the database yet then it is added and a unique integer ID is returned.

If the object exists (has the same "id" attribute as another object in the database), then that object is replaced with the one passed in

Example:

	// Add an object
	var myID = db.put({type: "point", x:10, y:20});

	// Update the object
	db.put({id: myID, type: "point", x:20, y:30});

## Delete

Remove an object from the database. Takes an ID as an argument.

Example: 

	// Add an object
	var myID = db.put({type: "point", x:10, y:20});

	// Remove the object
	db.delete(myID);

## Query

Use the "query" function and pass in an object through the "intersecting" property. These objects are defined the same way as objects that are put into the database. Any object and rotation can be used as the query criteria.

The result of the query will be an array of objects that intersect the query criteria.

