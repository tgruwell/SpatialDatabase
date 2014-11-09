var SpatialDatabase = function(options){
	this.objects = {};
	this.records = {};

	this.rtreeNodeWidth = 20;

	for(var k in options) this[k] = options[k];

	this.index = RTree(this.rtreeNodeWidth);

	this.uid = 0;
}

SpatialDatabase.prototype.put = function(rec){
	// Determine if we need to insert or update the record
	var update = false;
	if(typeof rec.id == "undefined"){
		rec.id = this.newID();
	}else if(typeof this.objects[rec.id] != "undefined"){
		update = true;
	}

	var id = rec.id;

	if(update){
		// Remove the object from the index
		this.index.remove(this.objects[id].boundingRect, id);
	}

	// Create the internal representation of the record
	var obj = this.initializeObject(rec); 

	// Index the object
	this.index.insert(obj.boundingRect, id);

	// Store it
	this.objects[id] = obj;
	this.records[id] = rec;

	return id;
}

SpatialDatabase.prototype["delete"] = function(id){
	this.index.remove(this.objects[id].boundingRect, id);
	delete this.objects[id];
}

SpatialDatabase.prototype.query = function(criteria){
	var results = [];

	var results1 = [];

	var resultDetails = {};

	// Narrow by intersection
	if(typeof criteria.intersecting != "undefined"){

		// Get some general information about the region we are looking at
		criteria.intersecting = this.initializeObject(criteria.intersecting);

		// Get all of the objects that are in the general area
		results1 = this.getByRect(criteria.intersecting.boundingRect);

		// Determine which objects intersect the object passed in
		for(var i=results1.length-1; i>=0; i--){
			var test = this.test.intersection(this.objects[results1[i]], criteria.intersecting);
			if(!test.success){
				results1.splice(i,1);
			}else{
				resultDetails[results1[i]] = test;
			}
		}
	}else{
		// No intersection criteria, start with all objects
		for(var k in this.objects){
			results1.push(k);
		}
	}

	// Narrow by key
	results = this.filterResults(results1, criteria);

	return this.expandResults(results, resultDetails);
}

SpatialDatabase.prototype.initializeObject = function(rec){
	var obj = {
		id: rec.id,
		points: [],
		edges: [],
		center: null,
		rotated: false,
		boundingRect: {},
		type: null
	};

	// Determine the points and edges that make up this object
	switch(rec.type){
		case "point":
			obj.points.push($V([rec.x, rec.y, 0]));
			obj.center = $V([rec.x, rec.y, 0]);
			obj.type = this.objectTypes["point"];
		break;

		case "lineseg":
			if(typeof rec.w == "undefined" || rec.w <= 1){
				// Standard line of 1px width
				obj.points.push($V([rec.p1.x, rec.p1.y, 0]));
				obj.points.push($V([rec.p2.x, rec.p2.y, 0]));
				obj.center = $V([(rec.p1.x+rec.p2.x)/2, (rec.p1.y+rec.p2.y)/2, 0]);
				obj.type = this.objectTypes["lineseg"];
			}else{
				// Represent a linesegment with width > 1 as a polygon
				var p1 = $V([rec.p1.x, rec.p1.y, 0]);
				var p2 = $V([rec.p2.x, rec.p2.y, 0]);

				var length = p1.distanceFrom(p2);
				if(typeof rec.encloseEnds != "undefined" && rec.encloseEnds){
					length += rec.w;
				}
				var angle = Math.atan2((p2.e(2)-p1.e(2)),(p2.e(1)-p1.e(1)));

				// Determine the center of the line
				obj.center = $V([(rec.p1.x+rec.p2.x)/2, (rec.p1.y+rec.p2.y)/2, 0]);

				// If this were a rotated rectangel, determine its initial, non-rotated 
				// parameters
				var x = obj.center.e(1) - length/2;
				var y = obj.center.e(2) - rec.w/2;
				var w = length;
				var h = rec.w;

				obj.points.push($V([x, 	   y,     0]));
				obj.points.push($V([x + w, y,     0]));
				obj.points.push($V([x + w, y + h, 0]));
				obj.points.push($V([x, 	   y + h, 0]));

				// Rotate the polygon so it is oriented in the same direction as the line
				for(var i=0; i<obj.points.length; i++){
					obj.points[i] = obj.points[i].rotate(angle, this.pointToAxis(obj.center));
				}

				obj.type = this.objectTypes["polygon"];
			}
		break;

		case "rect":
			obj.points.push($V([rec.x, 		   rec.y,          0]));
			obj.points.push($V([rec.x + rec.w, rec.y,          0]));
			obj.points.push($V([rec.x + rec.w, rec.y + rec.h,  0]));
			obj.points.push($V([rec.x, 		   rec.y + rec.h,  0]));
			obj.center = $V([rec.x + rec.w/2, rec.y + rec.h/2, 0]);
			obj.type = this.objectTypes["polygon"];
		break;

		case "polygon":
			var sumX = 0;
			var sumY = 0;
			for(var i=0; i<rec.points.length; i++){
				sumX += rec.points[i].x;
				sumY += rec.points[i].y;
				obj.points.push($V([rec.points[i].x, rec.points[i].y, 0]));
			}
			obj.center = $V([sumX/2, sumY/2, 0]);
			obj.type = this.objectTypes["polygon"];
		break;

		case "circle":
			obj.points.push($V([rec.x, rec.y, 0]));
			obj.radius = rec.r;
			obj.center = obj.points[0];
			obj.type = this.objectTypes["circle"];
		break;
	}

	// Rotate the points if applicable
	if(typeof rec.rot != "undefined"){
		obj.rotated = true;

		var axis =  this.pointToAxis(obj.center);
		var angle = rec.rot;

		if(typeof rec.rot.a != "undefined"){
			axis = this.pointToAxis($V([rec.rot.x, rec.rot.y]));
			angle = rec.rot.a;
		}

		obj.center = obj.center.rotate(angle, axis);

		for(var i=0; i<obj.points.length; i++){
			obj.points[i] = obj.points[i].rotate(angle, axis);
		}
	}

	// Build edges
	if(obj.points.length > 1){
		obj.edges = this.pointsToEdges(obj.points);
	}

	// Determine the bounding rectangle
	switch(obj.type){
		case this.objectTypes["point"]:
			obj.boundingRect = {x: obj.points[0].e(1), y: obj.points[0].e(2), w: 1, h: 1};
		break;

		case this.objectTypes["lineseg"]:
			var x1 = Math.min(obj.points[0].e(1), obj.points[1].e(1)); // The leftmost x
			var y1 = Math.min(obj.points[0].e(2), obj.points[1].e(2)); // The topmost y
			var x2 = Math.max(obj.points[0].e(1), obj.points[1].e(1)); // The rightmost x
			var y2 = Math.max(obj.points[0].e(2), obj.points[1].e(2)); // The bottommost y
		
			obj.boundingRect = {
				x: x1, 
				y: y1, 
				w: x2-x1, 
				h: y2-y1
			};
		break;

		case this.objectTypes["polygon"]:
			var x1 = 0;
			var y1 = 0;
			var x2 = 0;
			var y2 = 0;

			// Find the the maximum and minimum values of x and y
			for(var i=0; i<obj.points.length; i++){
				x1 = Math.min(x1, obj.points[i].e(1));
				y1 = Math.min(y1, obj.points[i].e(2));
				x2 = Math.max(x2, obj.points[i].e(1));
				y2 = Math.max(y2, obj.points[i].e(2));
			}

			obj.boundingRect = {
				x: x1, 
				y: y1, 
				w: x2-x1, 
				h: y2-y1
			};
		break;

		case this.objectTypes["circle"]:
			obj.boundingRect = {
				x: obj.points[0].e(1) - obj.radius,
				y: obj.points[0].e(2) - obj.radius,
				w: obj.radius*2,
				h: obj.radius*2
			};
		break;
	}

	return obj;
}

SpatialDatabase.prototype.pointsToEdges = function(points){
	var lines = [];
	for(var i=0; i<points.length; i++){
		if(i < points.length-1){
			// Add edges between all points except last -> first
			lines.push({
				type: this.objectTypes["lineseg"],
				points: [points[i],points[i+1]],
				line: $L(points[i], points[i+1].subtract(points[i]).toUnitVector())
			});
		}else if(points.length > 2){
			// As long as we aren't looking at a single line, add an edge for last -> first
			lines.push({
				type: this.objectTypes["lineseg"],
				points: [points[i], points[0]],
				line: $L(points[i], points[i].subtract(points[0]).toUnitVector())
			});
		}
	}
	return lines;
}


SpatialDatabase.prototype.getByRect = function(rect){
	return this.index.search(rect);
}

SpatialDatabase.prototype.getByPoint = function(point){
	return this.getByRect({x: point.x, y: point.y, w: 1, h: 1});
}

SpatialDatabase.prototype.expandResults = function(IDs, details){
	var result = [];
	for(var i=0; i<IDs.length; i++){
		result.push({record: this.records[IDs[i]], details: details[IDs[i]]});
	}
	return result;
}

SpatialDatabase.prototype.filterResults = function(results, criteria){
	// Filter an array of objects by only returning ones that have key value pairs
	// that match the criteria
	var filteredResults = [];
	var keys = [];
	for(var k in criteria){
		if(k != "intersecting"){
			keys.push(k);
		}
	}

	if(keys.length){
		for(var i=0; i<results.length; i++){
			var match = true;
			for(var j=0; j<keys.length; j++){
				var k = keys[j];
				if(this.records[results[i]][k] != criteria[k]){
					match = false;
				}
			}
			if(match){
				filteredResults.push(results[i]);
			}
		}

		return filteredResults;
	}else{
		// No filters applied
		return results;
	}

}

SpatialDatabase.prototype.pointToAxis = function(p){
	// Create a 3D axis from a 2D point
	return $L($V([p.e(1), p.e(2), 0]), $V([0, 0, 1]));
}

SpatialDatabase.prototype.getObjectData = function(id){
	return this.objects[id];
}

SpatialDatabase.prototype.newID = function(){
	return ++this.uid;
}

SpatialDatabase.prototype.objectTypes = {
	point: 0,
	line: 1,
	lineseg: 2,
	polygon: 3,
	circle: 4
}

SpatialDatabase.prototype.test = {

	/*
		Intersection Tests Peformed
			point point
			point lineseg
			point polygon
			point circle
			lineseg  lineseg
			lineseg polygon
			lineseg circle
			polygon polygon
			polygon circle
			circle circle
	*/

	intersection: function(obj1, obj2){
		if(obj1.type > obj2.type){
			// Keep the objects in order of type since testing an intersection
			// of a line and a point is the same as testing intersection between
			// a point and a line.
			var tempObj = obj2;
			obj2 = obj1;
			obj1 = tempObj;
		}

		var objectTypes = SpatialDatabase.prototype.objectTypes;

		switch(obj1.type){
			case objectTypes["point"]:
				switch(obj2.type){
					case objectTypes["point"]:
						return this.point_point(obj1, obj2);
					break;

					case objectTypes["lineseg"]:
						return this.point_linseg(obj1, obj2);
					break;

					case objectTypes["polygon"]:
						return this.point_polygon(obj1, obj2);
					break;

					case objectTypes["circle"]:
						return this.point_circle(obj1, obj2);
					break;
				}
			break;

			case objectTypes["lineseg"]:
				switch(obj2.type){
					case objectTypes["lineseg"]:
						return this.lineseg_lineseg(obj1, obj2);
					break;
					case objectTypes["polygon"]:
						return this.lineseg_polygon(obj1, obj2);
					break;
					case objectTypes["circle"]:
						return this.lineseg_circle(obj1, obj2);
					break;
				}
			break;

			case objectTypes["polygon"]:
				switch(obj2.type){
					case objectTypes["polygon"]:
						return this.polygon_polygon(obj1, obj2);
					case objectTypes["circle"]:
						return this.polygon_circle(obj1, obj2);
					break;
				}
			break;

			case objectTypes["circle"]:
				switch(obj2.type){
					case objectTypes["circle"]:
						return this.circle_circle(obj1, obj2);
					break;
				}
			break;
		}
	},

	point_point: function(point1, point2){
		var result = point1.points[0].eql(point2.points[0]);
		if(result){
			return {
				success: true,
				points: [point1]
			};
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	point_linseg: function(point, lineseg){
		var result = lineseg.edges[0].line.distanceFrom(point.points[0]);
		if(result <= 1 && this.point_between_points(point.points[0], lineseg.points[0], lineseg.points[1])){
			return {
				success: true,
				points: [point.points[0]]
			}
		}else{
			return {
				success: false,
				points: null
			}

		}
	},

	point_polygon: function(point, poly){
		// Cast a ray horizontally through the polygon. Start just outside the bounds of the polygon

		if(typeof point.points != "undefined"){
			// Get the vector representing this point
			point = point.points[0];
		}

		var rayAnchor = $V([poly.boundingRect.x-1, point.e(2), 0]);
		var ray = {line: $L(rayAnchor, point.subtract(rayAnchor).toUnitVector())}; // Wrap it so it looks like a standard line object
		var count = 0;

		// Determine how many times the ray intersects the polygon prior to reaching the test point
		var intersectingPoints = [];
		for(var i=0; i<poly.edges.length; i++){
			var test = this.line_lineseg(ray, poly.edges[i]);

			if(test.success && test.points[0].e(1) <= point.e(1)){
				
				// Check to see if we have intersected at exactly that point before (could happen at corners)
				for(var j=0; j<intersectingPoints.length; j++){
					if(intersectingPoints[j].distanceFrom(test.points[0]) < 0.01){
						test.success = false;
						break;
					}
				}

				if(test.success){
					intersectingPoints.push(test.points[0]);
					count++;
				}
			}
		}

		if(count % 2){
			// If the ray intersected the polygon an odd number of times before reaching the test point
			// then the point is inside the polygon
			return {
				success: true,
				points: [point]
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	point_circle: function(point, circle){
		var distance = point.points[0].distanceFrom(circle.points[0]);
		if(distance <= circle.radius){
			return {
				success: true,
				points: [point.points[0]]
			};
		}else{
			return {
				success: false,
				points: null
			};
		}
	},

	line_lineseg: function(line, lineseg){
		var point = line.line.intersectionWith(lineseg.line);
		if(point != null && this.point_between_points(point, lineseg.points[0], lineseg.points[1])){
			return {
				success: true,
				points: [point]
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	lineseg_lineseg: function(lineseg1, lineseg2){
		var edge1 = lineseg1;
		var edge2 = lineseg2;

		if(typeof lineseg1.edges != "undefined"){
			edge1 = lineseg1.edges[0];
		}
		if(typeof lineseg2.edges != "undefined"){
			edge2 = lineseg2.edges[0];
		}

		// Find the point where the two lines would intersect if they were infinately long
		var intersection = edge1.line.intersectionWith(edge2.line);

		// Check to see if the intersection lies between the start and end points of both lines
		if(intersection != null){
			intersection.round();
			var withinLineseg1 = this.point_between_points(intersection, edge1.points[0], edge1.points[1]);
			var withinLineseg2 = this.point_between_points(intersection, edge2.points[0], edge2.points[1]);
		}

		if(intersection != null && withinLineseg1 && withinLineseg2){
			return {
				success: true,
				points: [intersection]
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	lineseg_polygon: function(lineseg, polygon){
		var result = null;
		var success = false;
		var points = [];

		var findAllIntersections = true;

		// Check to see if the lineseg intersects any edge of the polygon
		for(var i=0; i<polygon.edges.length; i++){
			result = this.lineseg_lineseg(lineseg, polygon.edges[i]);
			if(result.success){
				success = true;

				points = points.concat(result.points);
				
				if(!findAllIntersections){
					break;
				}
			}
		}

		// Check to see if either endpoint lies inside the polygon
		if(!success){
			result = this.point_polygon(lineseg.points[0], polygon);
			success = result.success;
		}
		if(!success){
			result = this.point_polygon(lineseg.points[1], polygon);
			success = result.success;
		}

		if(success){
			return {
				success: true,
				points: points
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	lineseg_circle: function(lineseg, circle){
		var findIntersections = true;

		var analysis = this.point_relation_to_lineseg(circle.center, lineseg);

		if(analysis.distance <= circle.radius){

			var points = [];

			if(findIntersections){
				// Find the closest distance to the the line. This represents the distance of the line
				// that goes through the center of the circle and is perpendicular to the intersecting line
				var nearestPoint = analysis.extra.nearestPoint;
				var sideA = analysis.extra.nearestDistance;
				var sideB = circle.radius;
				var sideC = Math.sqrt(Math.pow(sideB,2) - Math.pow(sideA,2));

				var line = lineseg.line;
				if(typeof lineseg.edges != "undefined"){
					line = lineseg.edges[0].line;
				}

				var point1 = nearestPoint.add(line.direction.multiply(sideC));
				var point2 = nearestPoint.subtract(line.direction.multiply(sideC));

				if(this.point_between_points(point1, lineseg.points[0], lineseg.points[1])){
					points.push(point1);
				}

				if(this.point_between_points(point2, lineseg.points[0], lineseg.points[1])){
					points.push(point2);
				}
							
			}

			return {
				success: true,
				points: points
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	polygon_polygon: function(polygon1, polygon2){
		var result = null;
		var success = false;
		var points = [];

		var findAllIntersections = true;

		// Look at each edge in polygon1 and see if it intersects with polygon2
		for(var i=0; i<polygon1.edges.length; i++){
			result = this.lineseg_polygon(polygon1.edges[i], polygon2);
			if(result.success){
				success = true;

				points = points.concat(result.points);

				if(!findAllIntersections){
					break;
				}
			}
		}
		
		if(success){
			return {
				success: true,
				points: points
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	polygon_circle: function(polygon, circle){
		// Check to see if the circle intersects with any of the edges
		var result = null;
		var success = false;
		var points = [];

		var findAllIntersections = true;

		for(var i=0; i<polygon.edges.length; i++){
			result = this.lineseg_circle(polygon.edges[i], circle);

			if(result.success){
				success = true;

				points = points.concat(result.points);


				if(!findAllIntersections){
					break;
				}
			}
		}

		// Check to see if the circle's center point is inside the polygon
		if(!success){
			var result = this.point_polygon(circle.center, polygon);
			if(result.success){
				success = true;
			}
		}

		if(success){
			return {
				success: true,
				points: points
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
	},

	circle_circle: function(c1, c2){
		var maxDistance = c1.radius + c2.radius;
		var distance = c1.center.distanceFrom(c2.center);

		if(distance <= maxDistance){
			var points = [];

			// A line connecting the two circles
			var connectingLine =  $L(c1.center, c2.center.subtract(c1.center).toUnitVector()); 

			// Find the distance from c1 center to the midpoint of the intersection between the two circles
			var distanceToMidpoint = (Math.pow(distance,2) - Math.pow(c1.radius,2) + Math.pow(c2.radius,2)) / (2*distance);

			if(Math.abs(distanceToMidpoint) < c2.radius){
				// The point in the middle of the intersection
				var midpoint = c2.center.subtract(connectingLine.direction.multiply(distanceToMidpoint));

				// A line that passes through the midpoint perpendicular to the line connecting the two centers
				var secant = $L(midpoint, connectingLine.direction.rotate(Math.PI/2, $L($V([0,0,0]), $V([0,0,1]))));

				// Find the points where the secant intersects the edges of the circle
				var sideA = midpoint.distanceFrom(c1.center);
				var sideB = c1.radius;
				var sideC = Math.sqrt(Math.pow(sideB,2) - Math.pow(sideA,2));

				var point1 = midpoint.add(secant.direction.multiply(sideC));
				var point2 = midpoint.subtract(secant.direction.multiply(sideC));

				points.push(point1);
				points.push(point2);
			}

			return {
				success: true,
				points: points
			}
		}else{
			return {
				success: false,
				points: null
			}
		}
		
	},

	point_between_points: function(p1, p2, p3){
		// Test to see if p1 is in between p2 and p3
		if(  (p1.e(1) >= p2.e(1) && p1.e(1) <= p3.e(1))
		  || (p1.e(1) <= p2.e(1) && p1.e(1) >= p3.e(1))){
			if(  (p1.e(2) >= p2.e(2) && p1.e(2) <= p3.e(2))
			  || (p1.e(2) <= p2.e(2) && p1.e(2) >= p3.e(2))){
				return true;
			}
		}
		return false;
	},

	point_relation_to_lineseg: function(point, lineseg){
		var edge = lineseg;
		if(typeof edge.edges != "undefined"){
			edge = lineseg.edges[0];
		}
		var nearestPoint = edge.line.pointClosestTo(point);
		var distance = nearestPoint.distanceFrom(point);

		// When the edge is vertical or horizontal slight errors can result in failures later when we test point_between_points.
		// So we round the result
		nearestPoint = nearestPoint.round();
		

		if(this.point_between_points(nearestPoint, edge.points[0], edge.points[1])){
			// If the nearest point lies between the start and end points of the lineseg then return
			return {distance: distance, extra: {nearestPoint: nearestPoint, nearestDistance: distance}};
		}else{
			// If the nearest point lies outside the start and end points of the lineseg then return
			// the distance to whichever endpoint is nearest
			var distanceA = point.distanceFrom(edge.points[0]);
			var distanceB = point.distanceFrom(edge.points[1]);
			return {distance: Math.min(distanceA, distanceB), extra: {nearestPoint: nearestPoint, nearestDistance: distance}};
		}
	}


}